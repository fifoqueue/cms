import { beforeAll, describe, expect, test } from 'bun:test';
import type { CustomFetch } from 'openid-client';
import { OpenIdClientProvider } from '#api/infra/oidc/openid-client-provider';
import type { OidcClientSettings } from '#api/infra/oidc/openid-client-provider';
import { recordingLogger } from '#test/support/memory';
import { fixedClock, sequentialIds, userRecord } from '#test/support/memory';
import { createAuthClient } from '@cms/sdk/client';
import { AuthService } from '#api/domain/auth/auth-service';
import { SsoLogoutService } from '#api/domain/auth/sso-logout';
import type { OidcSessionBinding } from '#api/domain/auth/sso-ports';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  MemoryUsers,
  MemorySsoLogoutSessions,
  createMemoryAuthStore,
  plainHasher,
} from '#test/support/sso-memory';

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

const sign = async (
  key: CryptoKey,
  claims: Record<string, unknown>,
  header = { alg: 'RS256', kid: 'k1', typ: 'JWT' },
) => {
  const input = `${encode(header)}.${encode(claims)}`;
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

const logoutFixture = async () => {
  const op = createProvider({
    tamper: (claims) => ({ ...claims, sid: 'Sid ' }),
  });
  const { provider } = relyingParty(op);
  const request = await provider.authorize();
  const binding = await provider.verify(op.approve(request.url), request);
  const users = new MemoryUsers();
  const owner = userRecord({ id: 'logout-owner' });

  await users.insert(owner);
  const { sessions } = createMemoryAuthStore(users);
  const issuedAt = Math.floor(Date.now() / 1000) - 30;
  const clock = fixedClock(new Date((issuedAt - 1) * 1000).toISOString());
  const { logger } = recordingLogger();
  const hooks = new HookBus({ logger, timeoutMs: 100 });
  let sequence = 0;
  let lookups = 0;
  const auth = new AuthService({
    users,
    sessions,
    hasher: plainHasher,
    ids: sequentialIds(),
    tokens: { issue: () => `logout-session-${++sequence}`, digest: (s) => s },
    clock,
    sessionTtlMs: 3600000,
  });
  const ssoLogout = new SsoLogoutService({
    setup: async () => ({
      providers: [
        {
          id: 'op',
          issuer: ISSUER,
          name: 'OP',
          provider,
          subjects: new Map(),
        },
      ],
    }),
    sessions: new MemorySsoLogoutSessions(sessions),
    users: {
      findById: async (id) => {
        lookups++;

        return users.findById(id);
      },
    },
    hooks,
  });
  const app = await createApiApp({
    services: { ssoLogout } as unknown as ApiServices,
    logger,
  });
  const client = createAuthClient({
    baseUrl: 'http://localhost',
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const response = await app.fetch(new Request(input, init));

      if (response.ok) {
        expect(response.status).toBe(204);
        expect(await response.clone().text()).toBe('');
      }

      return response;
    }) as typeof fetch,
  });
  const claims = {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: binding.subject,
    sid: binding.sid,
    iat: issuedAt,
    exp: issuedAt + 300,
    jti: 'logout-1',
    events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
  };
  const session = (oidc: OidcSessionBinding | null = binding) =>
    auth.startSession(owner, null, oidc);

  return {
    client,
    session,
    sessions,
    clock,
    claims,
    hooks,
    binding,
    lookups: () => lookups,
  };
};

test('back-channel logout deletes only matching sessions, emits provider scope once, and cannot revoke newer sessions on replay', async () => {
  const f = await logoutFixture();
  const first = await f.session();
  const second = await f.session();
  const otherSid = await f.session({ ...f.binding, sid: 'sid ' });
  const otherSubject = await f.session({ ...f.binding, subject: 'Subject-1' });
  const otherIssuer = await f.session({ ...f.binding, issuer: `${ISSUER}/` });
  const noSid = await f.session({ issuer: ISSUER, subject: f.binding.subject });
  const local = await f.session(null);
  const events: unknown[] = [];
  const unsubscribe = f.hooks
    .registrar('observer')
    .on('user.signedOut', (event) => {
      expect(f.sessions.rows.has(first.token)).toBe(false);
      expect(f.sessions.rows.has(second.token)).toBe(false);
      events.push(event);
    });

  f.clock.set(new Date((f.claims.iat + 6) * 1000).toISOString());
  const newer = await f.session();
  const logoutToken = await sign(signingKey.privateKey, f.claims, {
    alg: 'RS256',
    kid: 'k1',
    typ: 'logout+jwt',
  });

  await f.client.backchannelLogout({ logoutToken });
  await f.client.backchannelLogout({ logoutToken });
  expect([...f.sessions.rows.keys()]).toEqual([
    otherSid.token,
    otherSubject.token,
    otherIssuer.token,
    noSid.token,
    local.token,
    newer.token,
  ]);
  expect(events).toEqual([
    {
      user: first.user,
      scope: 'provider',
      actorId: first.user.id,
    },
  ]);
  expect(f.lookups()).toBe(1);
  unsubscribe();

  await f.client.backchannelLogout({
    logoutToken: await sign(signingKey.privateKey, {
      ...f.claims,
      sid: undefined,
    }),
  });
  expect([...f.sessions.rows.keys()]).toEqual([
    otherSubject.token,
    otherIssuer.token,
    local.token,
    newer.token,
  ]);
  expect(f.lookups()).toBe(1);

  await f.client.backchannelLogout({
    logoutToken: await sign(signingKey.privateKey, {
      ...f.claims,
      sub: undefined,
    }),
  });
  expect([...f.sessions.rows.keys()]).toEqual([
    otherIssuer.token,
    local.token,
    newer.token,
  ]);
});

test('invalid logout tokens cannot delete sessions through the public API', async () => {
  const f = await logoutFixture();
  const session = await f.session();
  const invalid = [
    await sign(foreignKey.privateKey, f.claims),
    ...(await Promise.all(
      [
        { ...f.claims, aud: 'another-client' },
        { ...f.claims, events: {} },
        { ...f.claims, nonce: 'not-allowed' },
        { ...f.claims, sub: undefined, sid: undefined },
        { ...f.claims, sid: 'x'.repeat(256) },
        { ...f.claims, iat: undefined },
        { ...f.claims, jti: undefined },
        { ...f.claims, exp: undefined },
        { ...f.claims, iat: f.claims.iat - 600 },
        { ...f.claims, iat: f.claims.iat + 3600 },
        { ...f.claims, exp: f.claims.iat - 10 },
      ].map((claims) => sign(signingKey.privateKey, claims)),
    )),
    await sign(signingKey.privateKey, f.claims, {
      alg: 'RS256',
      kid: 'k1',
      typ: 'id+jwt',
    }),
    await sign(signingKey.privateKey, f.claims, {
      alg: 'HS256',
      kid: 'k1',
      typ: 'JWT',
    }),
    'x'.repeat(16_385),
  ];

  for (const logoutToken of invalid) {
    await expect(
      f.client.backchannelLogout({ logoutToken }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_input',
    });
    expect([...f.sessions.rows.keys()]).toEqual([session.token]);
  }

  expect(f.lookups()).toBe(0);
});

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
