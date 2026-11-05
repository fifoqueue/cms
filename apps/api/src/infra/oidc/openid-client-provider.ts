import {
  ClientSecretBasic,
  ClientSecretPost,
  None,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  calculatePKCECodeChallenge,
  customFetch,
  discovery,
  enableNonRepudiationChecks,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import type { ClientAuth, Configuration, CustomFetch } from 'openid-client';
import { z } from 'zod';
import {
  createRemoteJWKSet,
  customFetch as joseFetch,
  decodeJwt,
  jwtVerify,
} from 'jose';
import {
  LOGOUT_CLOCK_TOLERANCE,
  LOGOUT_MAX_AGE,
} from '#api/domain/auth/sso-logout-ports';
import type { VerifiedLogout } from '#api/domain/auth/sso-logout-ports';
import type {
  OidcAuthorizationRequest,
  OidcChecks,
  OidcProvider,
  VerifiedOidcIdentity,
} from '#api/domain/auth/sso-ports';
import { messageOf, unauthorized, Errors } from '#api/shared/errors';
import type { Logger } from '#api/shared/logger';
import { publicFetch } from '#api/infra/egress-policy';
import { storableIdentity } from '#api/domain/auth/sso-service';

const identityClaims = z.object({
  iss: z.string().refine(storableIdentity),
  sub: z.string().refine(storableIdentity),
  sid: z.string().refine(storableIdentity).optional(),
});

const logoutClaims = z
  .object({
    iss: z.string().refine(storableIdentity),
    sub: z.string().refine(storableIdentity).optional(),
    sid: z.string().refine(storableIdentity).optional(),
    iat: z.number(),
    exp: z.number(),
    jti: z.string().min(1),
    events: z.object({
      'http://schemas.openid.net/event/backchannel-logout': z.object({}),
    }),
  })
  .refine((claims) => claims.sub !== undefined || claims.sid !== undefined);

export type OidcClientAuthMethod =
  'client_secret_basic' | 'client_secret_post' | 'none';

export interface OidcClientSettings {
  /** HTTPS issuer identifier; discovery must report exactly this issuer. */
  issuer: string;
  clientId: string;
  clientSecret?: string;
  authMethod: OidcClientAuthMethod;
  /** Registered redirect URI without query or fragment. */
  redirectUri: string;
  postLogoutRedirectUri: string;
  scope: string;
  /** Outbound HTTP; the public egress policy when omitted. */
  fetch?: CustomFetch;
}

const clientAuth = ({
  authMethod,
  clientSecret,
}: OidcClientSettings): ClientAuth => {
  switch (authMethod) {
    case 'client_secret_basic':
      return ClientSecretBasic(clientSecret);
    case 'client_secret_post':
      return ClientSecretPost(clientSecret);
    case 'none':
      return None();
  }
};

/** OpenID Connect relying party on `openid-client` (certified implementation). */
export class OpenIdClientProvider implements OidcProvider {
  private configuration: Promise<Configuration> | undefined;
  private logoutKeys: ReturnType<typeof createRemoteJWKSet> | undefined;
  private issuer: string | undefined;

  constructor(
    private readonly settings: OidcClientSettings,
    private readonly logger: Logger,
  ) {}

  async authorize(): Promise<OidcAuthorizationRequest> {
    const config = await this.discover();
    const codeVerifier = randomPKCECodeVerifier();
    const state = randomState();
    const nonce = randomNonce();

    const url = buildAuthorizationUrl(config, {
      redirect_uri: this.settings.redirectUri,
      scope: this.settings.scope,
      code_challenge: await calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    return { url: url.href, state, nonce, codeVerifier };
  }

  async verify(
    query: string,
    checks: OidcChecks,
  ): Promise<VerifiedOidcIdentity> {
    const config = await this.discover();

    // The token request's redirect_uri is derived from this URL, so it is always the configured one.
    const callback = new URL(this.settings.redirectUri);

    callback.search = query;

    try {
      const tokens = await authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: checks.codeVerifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true,
      });
      const claims = identityClaims.parse(tokens.claims());

      return {
        issuer: claims.iss,
        subject: claims.sub,
        clientId: this.settings.clientId,
        idToken: tokens.id_token!,
        ...(claims.sid !== undefined ? { sid: claims.sid } : {}),
      };
    } catch (error) {
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? ` (${error.cause.message})`
          : '';

      this.logger.warn(`Single sign-on rejected: ${messageOf(error)}${cause}`);
      throw unauthorized(Errors.SsoFailed);
    }
  }

  async verifyLogout(token: string): Promise<VerifiedLogout | null> {
    try {
      // Unverified claims select a provider only; they never authorize a deletion.
      if (decodeJwt(token).iss !== (this.issuer ?? this.settings.issuer))
        return null;
      const config = await this.discover();
      const metadata = config.serverMetadata();

      if (decodeJwt(token).iss !== metadata.issuer) return null;
      if (!metadata.jwks_uri) throw new Error(Errors.SsoLogoutInvalid);
      this.logoutKeys ??= createRemoteJWKSet(new URL(metadata.jwks_uri), {
        [joseFetch]: (url, options) =>
          this.fetch(url, {
            ...options,
            body: undefined,
            headers: Object.fromEntries(options.headers),
          }),
      });
      const { payload, protectedHeader } = await jwtVerify(
        token,
        this.logoutKeys,
        {
          issuer: metadata.issuer,
          audience: this.settings.clientId,
          algorithms: [
            'RS256',
            'RS384',
            'RS512',
            'PS256',
            'PS384',
            'PS512',
            'ES256',
            'ES384',
            'ES512',
            'EdDSA',
            'Ed25519',
          ],
          requiredClaims: ['iss', 'aud', 'iat', 'exp', 'jti'],
          maxTokenAge: LOGOUT_MAX_AGE,
          clockTolerance: LOGOUT_CLOCK_TOLERANCE,
        },
      );

      if (
        Object.hasOwn(payload, 'nonce') ||
        (protectedHeader.typ !== undefined &&
          !['logout+jwt', 'application/logout+jwt', 'JWT'].includes(
            protectedHeader.typ,
          ))
      )
        throw new Error(Errors.SsoLogoutInvalid);
      const claims = logoutClaims.parse(payload);

      return {
        issuer: claims.iss,
        issuedAt: claims.iat,
        ...(claims.sid !== undefined
          ? {
              sid: claims.sid,
              ...(claims.sub !== undefined ? { subject: claims.sub } : {}),
            }
          : { subject: claims.sub! }),
      };
    } catch (error) {
      this.logger.warn(`Single sign-on logout rejected: ${messageOf(error)}`);

      return null;
    }
  }

  private readonly fetch: CustomFetch = (url, options) =>
    this.settings.fetch
      ? this.settings.fetch(url, options)
      : publicFetch(url, options as unknown as RequestInit);

  async endSession(
    clientId: string,
    idTokenHint?: string,
  ): Promise<string | null> {
    if (clientId !== this.settings.clientId) return null;
    const config = await this.discover();

    if (!config.serverMetadata().end_session_endpoint) return null;

    return buildEndSessionUrl(config, {
      client_id: this.settings.clientId,
      post_logout_redirect_uri: this.settings.postLogoutRedirectUri,
      ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
    }).href;
  }

  /**
   * Discovers once; a failed discovery is retried on the next request. The reason (such as an
   * issuer that differs from the discovered one) stays in the server log.
   */
  private discover() {
    this.configuration ??= discovery(
      new URL(this.settings.issuer),
      this.settings.clientId,
      undefined,
      clientAuth(this.settings),
      {
        execute: [enableNonRepudiationChecks],
        [customFetch]: this.fetch,
      },
    )
      .then((config) => {
        this.issuer = config.serverMetadata().issuer;

        return config;
      })
      .catch((error: unknown) => {
        this.configuration = undefined;
        this.logger.warn(
          `Single sign-on discovery failed for ${this.settings.issuer}: ${messageOf(error)}`,
        );
        throw unauthorized(Errors.SsoFailed);
      });

    return this.configuration;
  }
}
