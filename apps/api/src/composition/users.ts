import { createAuth } from '#api/composition/auth';
import type { createRepositories } from '#api/composition/repositories';
import type { createRegistries } from '#api/composition/registries';
import type { createJobs } from '#api/composition/jobs';
import type { createEmail } from '#api/composition/email';
import type { createSecurity } from '#api/composition/security';
import { ApiTokenService } from '#api/domain/auth/api-tokens';
import {
  PASSWORD_RESET_REQUEST_JOB,
  PasswordService,
} from '#api/domain/auth/password-service';
import { RecoveryService } from '#api/domain/auth/recovery-service';
import { RoleService } from '#api/domain/users/role-service';
import { UserCapabilities } from '#api/domain/users/user-capabilities';
import { ProfileMeta } from '#api/domain/users/profile-meta';
import { REGISTRATION_JOB, UserService } from '#api/domain/users/user-service';
import type { SiteService } from '#api/domain/site/site-service';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import type { JobRunner } from '#api/domain/jobs/job-runner';
import type { Logger } from '#api/shared/logger';
import type { PublicCache } from '#api/domain/site/public-cache';
import {
  bunPasswordHasher,
  randomTokenIssuer,
  systemClock,
  uuidV7,
} from '#api/infra/system';

type Jobs = ReturnType<typeof createJobs>;
type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  | 'apiTokenRepository'
  | 'settingsRepository'
  | 'directory'
  | 'users'
  | 'sessions'
  | 'passwordTokens'
  | 'passwordCredentials'
  | 'rateLimits'
  | 'profileRepository'
  | 'recoveryCodes'
> &
  Pick<
    ReturnType<typeof createRegistries>,
    'hooks' | 'capabilities' | 'roleDefaults' | 'profileFields'
  > &
  Pick<ReturnType<typeof createSecurity>, 'protection'> & {
    config: Parameters<typeof createAuth>[2];
    email: Awaited<ReturnType<typeof createEmail>>['email'];
    sealedJobs: Jobs['sealedJobs'];
    passwordLogin: () => Promise<boolean>;
    avatar: ConstructorParameters<typeof UserService>[0]['avatar'];
    site: Pick<SiteService, 'get'>;
    seo: Pick<SeoSettingsService, 'getPublic'>;
    logger: Logger;
    publicCache: PublicCache;
  };

export const createUsers = ({
  apiTokenRepository,
  settingsRepository,
  directory,
  users,
  sessions,
  passwordTokens,
  passwordCredentials,
  rateLimits,
  profileRepository,
  recoveryCodes,
  hooks,
  capabilities,
  roleDefaults,
  profileFields,
  protection,
  config,
  email,
  sealedJobs,
  passwordLogin,
  avatar,
  site,
  seo,
  logger,
  publicCache,
}: Input) => {
  const apiTokens = new ApiTokenService({
    tokens: apiTokenRepository,
    issuer: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
  });
  const roles = new RoleService(
    settingsRepository,
    directory,
    hooks,
    new UserCapabilities(hooks, capabilities, logger),
    capabilities,
    roleDefaults,
  );
  const auth = createAuth(users, sessions, config, {
    hooks,
    apiTokens,
    roles,
  });
  const passwords = new PasswordService({
    hooks,
    passwordLogin,
    users,
    tokens: passwordTokens,
    credentials: passwordCredentials,
    issuer: randomTokenIssuer,
    hasher: bunPasswordHasher,
    limits: rateLimits,
    email,
    sealedJobs,
    protection,
    clock: systemClock,
    site: async () => ({
      siteUrl: (await seo.getPublic()).siteUrl,
      ...(await site.get()),
    }),
  });
  const userAdmin = new UserService({
    publicCache,
    profiles: new ProfileMeta(profileFields, profileRepository),
    hooks,
    roles,
    settings: settingsRepository,
    protection,
    users,
    directory,
    hasher: bunPasswordHasher,
    tokens: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
    sealedJobs,
    avatar,
    invitations: {
      available: () => email.enabled(),
      send: (user) => passwords.invite(user),
    },
  });
  const recovery = new RecoveryService({
    sessionRepository: sessions,
    codes: recoveryCodes,
    users,
    roles,
    tokens: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
    sessions: auth,
    protection,
    email,
    site: () => site.get(),
    logger,
  });
  const registerJobs = (jobs: Pick<JobRunner, 'handle'>) => {
    jobs.handle(PASSWORD_RESET_REQUEST_JOB, (payload) =>
      passwords.deliverResetRequest(payload),
    );
    jobs.handle(REGISTRATION_JOB, (payload) =>
      userAdmin.completeRegistration(payload),
    );
  };
  return {
    apiTokens,
    roles,
    auth,
    passwords,
    userAdmin,
    recovery,
    registerJobs,
  };
};
