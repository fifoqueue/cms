import type { AppConfig } from '#api/config';
import { AuthService } from '#api/domain/auth/auth-service';
import type { AuthServiceDeps } from '#api/domain/auth/auth-service';
import type { SessionRepository, UserRepository } from '#api/domain/auth/ports';
import { OpenIdClientProvider } from '#api/infra/oidc/openid-client-provider';
import type { OidcClientSettings } from '#api/infra/oidc/openid-client-provider';
import {
  bunPasswordHasher,
  randomTokenIssuer,
  systemClock,
  uuidV7,
} from '#api/infra/system';
import type { Logger } from '#api/shared/logger';
import { SSO_SIGNED_OUT_PATH } from '#api/domain/auth/sso-settings';

export const createAuth = (
  users: UserRepository,
  sessions: SessionRepository,
  config: Pick<AppConfig, 'SESSION_TTL_HOURS'>,
  extras: Pick<
    AuthServiceDeps,
    'apiTokens' | 'roles' | 'hooks' | 'endSession'
  > = {},
) =>
  new AuthService({
    users,
    sessions,
    hasher: bunPasswordHasher,
    tokens: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
    sessionTtlMs: config.SESSION_TTL_HOURS * 60 * 60 * 1000,
    ...extras,
  });

/** Single sign-on is enabled only when the issuer, client id and redirect URI are configured. */
export const createOidcProvider = (
  config: Pick<
    AppConfig,
    | 'OIDC_ISSUER'
    | 'OIDC_CLIENT_ID'
    | 'OIDC_REDIRECT_URI'
    | 'OIDC_CLIENT_SECRET'
    | 'OIDC_CLIENT_AUTH_METHOD'
    | 'OIDC_SCOPES'
  >,
  logger: Logger,
  fetcher: NonNullable<OidcClientSettings['fetch']>,
) => {
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_CLIENT_SECRET } =
    config;

  if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_REDIRECT_URI) return null;

  return new OpenIdClientProvider(
    {
      issuer: OIDC_ISSUER,
      clientId: OIDC_CLIENT_ID,
      clientSecret: OIDC_CLIENT_SECRET,
      // RFC 7591 default for clients holding a secret; public clients rely on PKCE alone.
      authMethod:
        config.OIDC_CLIENT_AUTH_METHOD ??
        (OIDC_CLIENT_SECRET ? 'client_secret_basic' : 'none'),
      redirectUri: OIDC_REDIRECT_URI,
      postLogoutRedirectUri: `${new URL(OIDC_REDIRECT_URI).origin}${SSO_SIGNED_OUT_PATH}`,
      scope: config.OIDC_SCOPES,
      fetch: fetcher,
    },
    logger,
  );
};
