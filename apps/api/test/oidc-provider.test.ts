import { beforeAll, describe, expect, test } from 'bun:test';
import type { CustomFetch } from 'openid-client';
import { OpenIdClientProvider } from '#api/infra/oidc/openid-client-provider';
import type { OidcClientSettings } from '#api/infra/oidc/openid-client-provider';
import { recordingLogger } from '#test/support/memory';

const ISSUER = 'https://op.test';
const CLIENT_ID = 'cms';
const CLIENT_SECRET = 'client-secret';
const REDIRECT_URI = 'https://cms.test/admin/sso/callback';

const encode = (value: unknown) =>
  Buffer.from(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).toString('base64url');

const generateKey = () =>
  crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );

const sign = async (key: CryptoKey, claims: Record<string, unknown>) => {
  const input = `${encode({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
};

const s256 = async (verifier: string) =>
  Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  ).toString('base64url');

interface Grant {
  challenge: string;
  nonce: string;
  redirectUri: string;
}

type Claims = Record<string, unknown>;

let signingKey: CryptoKeyPair;
let foreignKey: CryptoKeyPair;

beforeAll(async () => {
  signingKey = await generateKey();
  foreignKey = await generateKey();
});

/** Minimal in-process OpenID Provider. `tamper` rewrites ID token claims or the signing key. */
const createProvider = ({
  tamper = (claims: Claims) => claims,
  key = () => signingKey.privateKey,
} = {}) => {
  const grants = new Map<string, Grant>();
  const tokenRequests: {
    body: URLSearchParams;
    authorization: string | null;
  }[] = [];

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/.well-known/openid-configuration'))
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });

    if (url.pathname === '/jwks') {
      const jwk = await crypto.subtle.exportKey('jwk', signingKey.publicKey);
      return Response.json({
        keys: [
          {
            kty: jwk.kty,
            n: jwk.n,
            e: jwk.e,
            kid: 'k1',
            alg: 'RS256',
            use: 'sig',
          },
        ],
      });
    }

    if (url.pathname === '/token') {
      const body = new URLSearchParams(await request.text());
      tokenRequests.push({
        body,
        authorization: request.headers.get('authorization'),
      });
      const grant = grants.get(body.get('code') ?? '');
      const verifier = body.get('code_verifier') ?? '';
      if (
        !grant ||
        grant.redirectUri !== body.get('redirect_uri') ||
        grant.challenge !== (await s256(verifier))
      )
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      grants.delete(body.get('code') ?? '');

      const now = Math.floor(Date.now() / 1000);
      const claims = tamper({
        iss: ISSUER,
        sub: 'subject-1',
        aud: CLIENT_ID,
        iat: now,
        exp: now + 300,
        nonce: grant.nonce,
        email: 'admin@example.com',
        email_verified: true,
      });
      return Response.json({
        access_token: 'access',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: await sign(key(), claims),
      });
    }

    return new Response('not found', { status: 404 });
  };

  const fetch: CustomFetch = (url, options) =>
    handle(new Request(url, options as RequestInit));

  /** Simulates the user approving the request: returns the redirect URI query. */
  const approve = (authorizationUrl: string, code = 'code-1') => {
    const params = new URL(authorizationUrl).searchParams;
    grants.set(code, {
      challenge: params.get('code_challenge') ?? '',
      nonce: params.get('nonce') ?? '',
      redirectUri: params.get('redirect_uri') ?? '',
    });
    return `?code=${code}&state=${params.get('state')}`;
  };

  return { fetch, approve, tokenRequests };
};

const relyingParty = (
  op: ReturnType<typeof createProvider>,
  overrides: Partial<OidcClientSettings> = {},
) => {
  const { logger, lines } = recordingLogger();
  const provider = new OpenIdClientProvider(
    {
      issuer: ISSUER,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      authMethod: 'client_secret_basic',
      redirectUri: REDIRECT_URI,
      scope: 'openid',
      fetch: op.fetch,
      ...overrides,
    },
    logger,
  );
  return { provider, lines };
};

describe('OpenIdClientProvider', () => {
  test('authorization code flow with PKCE S256, state and nonce yields the verified subject', async () => {
    const op = createProvider();
    const { provider } = relyingParty(op);

    const request = await provider.authorize();
    const params = new URL(request.url).searchParams;
    expect(request.url.startsWith(`${ISSUER}/authorize?`)).toBe(true);
    expect(Object.fromEntries(params)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'openid',
      code_challenge_method: 'S256',
      code_challenge: await s256(request.codeVerifier),
      state: request.state,
      nonce: request.nonce,
    });
    expect(params.has('code_verifier')).toBe(false);

    expect(await provider.verify(op.approve(request.url), request)).toEqual({
      issuer: ISSUER,
      subject: 'subject-1',
    });

    const [token] = op.tokenRequests;
    expect(token?.body.get('code_verifier')).toBe(request.codeVerifier);
    expect(token?.body.get('redirect_uri')).toBe(REDIRECT_URI);
    // RFC 6749 §2.3.1: credentials are form-encoded before Base64.
    const [id, secret] = atob(token?.authorization?.slice(6) ?? '')
      .split(':')
      .map(decodeURIComponent);
    expect(token?.authorization?.startsWith('Basic ')).toBe(true);
    expect([id, secret]).toEqual([CLIENT_ID, CLIENT_SECRET]);
  });

  test('a discovered issuer other than the configured one is a handled failure', async () => {
    const { provider, lines } = relyingParty(createProvider(), {
      issuer: `${ISSUER}/application/o/app/`,
    });
    await expect(provider.authorize()).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(lines).toEqual([
      expect.stringContaining('does not match the expected issuer'),
    ]);
  });

  const rejects = (
    name: string,
    op: ReturnType<typeof createProvider>,
    respond: (
      url: string,
      checks: { state: string; nonce: string; codeVerifier: string },
    ) => {
      query: string;
      checks: { state: string; nonce: string; codeVerifier: string };
    },
  ) =>
    test(`rejects ${name}`, async () => {
      const { provider, lines } = relyingParty(op);
      const request = await provider.authorize();
      const { query, checks } = respond(request.url, request);
      await expect(provider.verify(query, checks)).rejects.toMatchObject({
        code: 'unauthorized',
      });
      // Each case must fail for its own reason, not an incidental one.
      expect(lines).toEqual([
        expect.stringContaining(REASONS[name] ?? 'unlisted case'),
      ]);
    });

  const REASONS: Record<string, string> = {
    'a state mismatch': '"state" response parameter',
    'a wrong PKCE verifier': 'error in the response body',
    'a nonce mismatch': '"nonce" claim',
    'an ID token from another issuer': '"iss" (issuer)',
    'an ID token for another audience': '"aud" (audience)',
    'an expired ID token': '"exp" (expiration time)',
    'an ID token with an invalid signature':
      'JWT signature verification failed',
    'a provider error response': 'response from the server is an error',
  };

  {
    const op = createProvider();
    rejects('a state mismatch', op, (url, checks) => ({
      query: op.approve(url),
      checks: { ...checks, state: 'other-state' },
    }));
  }
  {
    const op = createProvider();
    rejects('a wrong PKCE verifier', op, (url, checks) => ({
      query: op.approve(url),
      checks: { ...checks, codeVerifier: 'x'.repeat(43) },
    }));
  }
  {
    const op = createProvider();
    rejects('a nonce mismatch', op, (url, checks) => ({
      query: op.approve(url),
      checks: { ...checks, nonce: 'other-nonce' },
    }));
  }
  {
    const op = createProvider({
      tamper: (c) => ({ ...c, iss: 'https://evil.test' }),
    });
    rejects('an ID token from another issuer', op, (url, checks) => ({
      query: op.approve(url),
      checks,
    }));
  }
  {
    const op = createProvider({
      tamper: (c) => ({ ...c, aud: 'another-client' }),
    });
    rejects('an ID token for another audience', op, (url, checks) => ({
      query: op.approve(url),
      checks,
    }));
  }
  {
    const op = createProvider({
      tamper: (c) => ({ ...c, exp: Math.floor(Date.now() / 1000) - 3600 }),
    });
    rejects('an expired ID token', op, (url, checks) => ({
      query: op.approve(url),
      checks,
    }));
  }
  {
    const op = createProvider({ key: () => foreignKey.privateKey });
    rejects('an ID token with an invalid signature', op, (url, checks) => ({
      query: op.approve(url),
      checks,
    }));
  }
  {
    const op = createProvider();
    rejects('a provider error response', op, (_url, checks) => ({
      query: `?error=access_denied&state=${checks.state}`,
      checks,
    }));
  }
});
