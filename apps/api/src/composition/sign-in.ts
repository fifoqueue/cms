import type { AppConfig } from '#api/config';
import { createOidcProvider } from '#api/composition/auth';
import type { createRepositories } from '#api/composition/repositories';
import type { createRegistries } from '#api/composition/registries';
import type { createSecurity } from '#api/composition/security';
import type { createUsers } from '#api/composition/users';
import type { createSite } from '#api/composition/site';
import { SignInSettingsService } from '#api/domain/auth/sign-in-settings';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import { SsoService } from '#api/domain/auth/sso-service';
import { SsoLogoutService } from '#api/domain/auth/sso-logout';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { createSignInUsers } from '#api/domain/auth/sign-in-users';
import { createSsoMethod } from '#api/domain/auth/sso-method';
import { createPasswordMethod } from '#api/domain/auth/password-method';
import {
  createPasskeyMethod,
  createPasskeyFactor,
} from '#api/domain/auth/passkey/passkey';
import { createTotpFactor } from '#api/domain/auth/totp/totp';
import { createRecoveryFactor } from '#api/domain/auth/recovery-factor';
import { simpleWebAuthn } from '#api/infra/passkey-webauthn';
import { totpAlgorithm } from '#api/infra/totp-crypto';
import { OpenIdClientProvider } from '#api/infra/oidc/openid-client-provider';
import type { OidcClientSettings } from '#api/infra/oidc/openid-client-provider';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import {
  bunPasswordHasher,
  randomTokenIssuer,
  systemClock,
  uuidV7,
} from '#api/infra/system';
import { invalidInput, Errors } from '#api/shared/errors';
import type { Logger } from '#api/shared/logger';

type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  | 'ssoSettingsAccess'
  | 'settingsRepository'
  | 'ssoAccess'
  | 'users'
  | 'ssoIdentities'
  | 'ssoTransactions'
  | 'ssoLogoutSessions'
  | 'signInSettingsTransactions'
  | 'methodIdentities'
  | 'passkeys'
  | 'totpSecrets'
  | 'factorCodes'
  | 'factorChanges'
  | 'signInTransactions'
  | 'setupTokens'
> &
  Pick<ReturnType<typeof createRegistries>, 'authentication' | 'hooks'> &
  Pick<
    ReturnType<typeof createSecurity>,
    'egressFetch' | 'checkUrl' | 'protection'
  > &
  Pick<ReturnType<typeof createUsers>, 'auth' | 'roles' | 'passwords'> &
  Pick<ReturnType<typeof createSite>, 'site' | 'seo'> & {
    config: Pick<
      AppConfig,
      | keyof Parameters<typeof createOidcProvider>[0]
      | 'OIDC_NAME'
      | 'OIDC_ALLOWED_SUBJECTS'
      | 'OIDC_STARTS_PER_MINUTE_PER_CLIENT'
      | 'OIDC_STARTS_PER_MINUTE'
      | 'OIDC_MAX_PENDING_REQUESTS'
      | 'OIDC_MAX_PENDING_PER_CLIENT'
      | 'CMS_ALLOW_PASSWORD_LOGIN'
    >;
    logger: Logger;
    secrets: ConstructorParameters<typeof SsoSettingsService>[0]['secrets'];
    otherMethod: SignInSettingsService['otherUsable'];
  };

export const createSignIn = ({
  ssoSettingsAccess,
  settingsRepository,
  ssoAccess,
  users,
  ssoIdentities,
  ssoTransactions,
  ssoLogoutSessions,
  signInSettingsTransactions,
  methodIdentities,
  passkeys,
  totpSecrets,
  factorCodes,
  factorChanges,
  signInTransactions,
  setupTokens,
  authentication,
  hooks,
  egressFetch,
  checkUrl,
  protection,
  auth,
  passwords,
  roles,
  site,
  seo,
  config,
  logger,
  secrets,
  otherMethod,
}: Input) => {
  const oidcFetch: NonNullable<OidcClientSettings['fetch']> = (url, options) =>
    egressFetch('oidc')(url, options as RequestInit);
  const ssoProvider = createOidcProvider(config, logger, oidcFetch);
  const ssoSettings = new SsoSettingsService({
    hooks,
    environmentRedirectUri: config.OIDC_REDIRECT_URI,
    access: ssoSettingsAccess,
    otherMethod,
    settings: settingsRepository,
    secrets,
    siteUrl: async () => (await seo.getPublic()).siteUrl,
    connect: (client) =>
      new OpenIdClientProvider({ ...client, fetch: oidcFetch }, logger),
    checkIssuer: (issuer) => checkUrl('oidc', issuer),
    environment: ssoProvider && {
      id: 'environment',
      issuer: config.OIDC_ISSUER!,
      provider: ssoProvider,
      name: config.OIDC_NAME,
      subjects: new Map(Object.entries(config.OIDC_ALLOWED_SUBJECTS)),
    },
  });
  const ssoStarts = new MemoryRateLimiter({
    clock: systemClock,
    perKey: config.OIDC_STARTS_PER_MINUTE_PER_CLIENT,
    total: config.OIDC_STARTS_PER_MINUTE,
    windowMs: 60_000,
  });
  const sso = new SsoService({
    policy: async (store, user) => ({
      ...(await ssoSettings.policy(store)),
      otherMethod: await otherMethod(user, store),
    }),
    access: ssoAccess,
    setup: (store) => ssoSettings.setup(store),
    users,
    identities: ssoIdentities,
    transactions: ssoTransactions,
    sessions: auth,
    tokens: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
    transactionTtlMs: 10 * 60 * 1000,
    admission: {
      total: config.OIDC_MAX_PENDING_REQUESTS,
      perClient: config.OIDC_MAX_PENDING_PER_CLIENT,
    },
    startLimiter: ssoStarts,
  });
  const signInSettings = new SignInSettingsService({
    hooks,
    settings: settingsRepository,
    transactions: signInSettingsTransactions,
    registry: authentication,
    passwordForced: config.CMS_ALLOW_PASSWORD_LOGIN,
    logger,
  });
  const authUsers = createSignInUsers(users, roles);
  const ssoLogout = new SsoLogoutService({
    setup: () => ssoSettings.setup(),
    sessions: ssoLogoutSessions,
    users,
    hooks,
  });
  const coreAuth = authentication.core(authUsers);

  coreAuth.signInMethod(
    'sso',
    createSsoMethod({
      setup: () => ssoSettings.setup(),
      identities: methodIdentities,
      resolve: (identity, subjects) => sso.resolve(identity, subjects),
      ids: uuidV7,
      clock: systemClock,
      starts: ssoStarts,
    }),
  );
  coreAuth.signInMethod(
    'password',
    createPasswordMethod({
      users,
      hasher: bunPasswordHasher,
      passwords,
    }),
  );
  const passkeyDeps = {
    passkeys,
    webauthn: simpleWebAuthn,
    ids: uuidV7,
    clock: systemClock,
    site: async () => ({
      siteUrl: (await seo.getPublic()).siteUrl,
      title: (await site.get()).title,
    }),
  };

  coreAuth.signInMethod('passkey', createPasskeyMethod(passkeyDeps));
  coreAuth.secondFactor('passkey', createPasskeyFactor(passkeyDeps));
  coreAuth.secondFactor(
    'totp',
    createTotpFactor({
      secrets: totpSecrets,
      box: secrets,
      clock: systemClock,
      ids: uuidV7,
      totp: totpAlgorithm,
      site: () => site.get(),
    }),
  );
  coreAuth.secondFactor(
    'recovery-code',
    createRecoveryFactor(factorCodes, randomTokenIssuer),
  );
  const signIn = new SignInService({
    registry: authentication,
    settings: signInSettings,
    factorChanges,
    transactions: signInTransactions,
    setupTokens,
    tokens: randomTokenIssuer,
    users: authUsers,
    clock: systemClock,
    limits: {
      total: config.OIDC_MAX_PENDING_REQUESTS,
      perClient: config.OIDC_MAX_PENDING_PER_CLIENT,
    },
    protection,
    hooks,
    siteUrl: async () => (await seo.getPublic()).siteUrl,
    session: async (profile, identityId, oidc) => {
      const user = await users.findById(profile.id);

      if (!user) throw invalidInput(Errors.InvalidCredentials);

      return auth.startSession(user, identityId ?? null, oidc ?? null);
    },
  });

  return { ssoSettings, sso, ssoLogout, signInSettings, authUsers, signIn };
};
