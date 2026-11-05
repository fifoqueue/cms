import type { createPersistence } from '#api/composition/persistence';
import { PrismaSsoLogoutSessions } from '#api/infra/prisma/sso-logout';
import { PrismaContentRepository } from '#api/infra/prisma/content-repository';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';
import { PrismaSettingsTransactions } from '#api/infra/prisma/settings-transactions';
import { PrismaPatternCatalog } from '#api/infra/prisma/pattern-catalog';
import { PrismaTaxonomyRepository } from '#api/infra/prisma/taxonomy-repository';
import { PrismaPublishedContentRepository } from '#api/infra/prisma/published-content-repository';
import { PrismaMediaRepository } from '#api/infra/prisma/media-repository';
import { PrismaAvatarDirectory } from '#api/infra/prisma/avatar-directory';
import { PrismaRateLimitStore } from '#api/infra/prisma/rate-limit-store';
import { PrismaPrivacyRepository } from '#api/infra/prisma/privacy-repository';
import { PrismaSearchSource } from '#api/infra/prisma/search-source';
import { PrismaPermalinkRepository } from '#api/infra/prisma/permalink-repository';
import { PrismaArchivePaths } from '#api/infra/prisma/archive-paths';
import { PrismaSiteSettingsWriter } from '#api/infra/prisma/site-settings';
import { PrismaSeoDiscoveryRepository } from '#api/infra/prisma/seo-discovery-repository';
import { PrismaRevisionRepository } from '#api/infra/prisma/revision-repository';
import { PrismaJobQueue } from '#api/infra/prisma/job-queue';
import { PrismaTaskLeases } from '#api/infra/prisma/task-leases';
import { PrismaMediaKeyCatchUp } from '#api/infra/prisma/media-key-catch-up';
import {
  PrismaUserRepository,
  PrismaSessionRepository,
  PrismaRecoveryCodeRepository,
} from '#api/infra/prisma/auth-repositories';
import { PrismaPasswordTokenRepository } from '#api/infra/prisma/password-tokens';
import { PrismaApiTokenRepository } from '#api/infra/prisma/api-tokens';
import { PrismaUserDirectory } from '#api/infra/prisma/user-directory';
import { PrismaCredentialRepository } from '#api/infra/prisma/credentials';
import { PrismaTotpRepository } from '#api/infra/totp-repository';
import { PrismaCleanupCatalog } from '#api/infra/prisma/cleanup-catalog';
import { PrismaProfileMeta } from '#api/infra/prisma/profile-meta';
import { PrismaCommentRepository } from '#api/infra/prisma/comment-repository';
import {
  PrismaCommentNoticeState,
  PrismaNoticeOutbox,
} from '#api/infra/prisma/comment-notices';
import { PrismaPushSubscriptionRepository } from '#api/infra/prisma/push-subscription-repository';
import {
  PrismaSsoAccessTransactions,
  PrismaIdentityRepository,
  PrismaSsoTransactionRepository,
} from '#api/infra/prisma/sso-repositories';
import {
  PrismaPluginDataRepository,
  PrismaPluginStateRepository,
} from '#api/infra/prisma/plugin-repositories';
import { PrismaPasskeyRepository } from '#api/infra/passkey-repository';
import { PrismaSignInTransactions } from '#api/infra/prisma/sign-in-transactions';
import { PrismaSetupTokens } from '#api/infra/prisma/setup-tokens';
import { PrismaExpiredCleanup } from '#api/infra/prisma/expired-cleanup';
import { PrismaDatabaseCleanupStore } from '#api/infra/prisma/database-cleanup';
import { uuidV7 } from '#api/infra/system';

type Input = Pick<ReturnType<typeof createPersistence>, 'db' | 'wrap'> & {
  hooks: ConstructorParameters<typeof PrismaContentRepository>[2];
  permalinkTokens: ConstructorParameters<typeof PrismaContentRepository>[1];
  secrets: ConstructorParameters<typeof PrismaPrivacyRepository>[1];
  logger: ConstructorParameters<typeof PrismaPermalinkRepository>[2];
  regeneratePermalinks: ConstructorParameters<
    typeof PrismaTaxonomyRepository
  >[1];
  roleExists: ConstructorParameters<typeof PrismaUserDirectory>[1];
  activeContentTypes: ConstructorParameters<typeof PrismaSearchSource>[1];
  cleanup: Pick<
    ConstructorParameters<typeof PrismaDatabaseCleanupStore>[1],
    'content' | 'comment'
  >;
};

export const createRepositories = async ({
  db,
  wrap,
  hooks,
  permalinkTokens,
  secrets,
  logger,
  regeneratePermalinks,
  roleExists,
  activeContentTypes,
  cleanup,
}: Input) => {
  const contentRepository = wrap(
    new PrismaContentRepository(db, permalinkTokens, hooks),
    ['insert', 'update', 'delete', 'setTrashed', 'publishDue'],
  );
  const settingsRepository = wrap(new PrismaSettingsRepository(db), ['set']);
  const patternTransactions = wrap(new PrismaSettingsTransactions(db), ['run']);
  const patternCatalog = new PrismaPatternCatalog(db);
  const taxonomyRepository = wrap(
    new PrismaTaxonomyRepository(db, regeneratePermalinks, permalinkTokens),
    ['insert', 'update', 'delete'],
  );
  const rawPublishedRepository = new PrismaPublishedContentRepository(
    db,
    hooks,
  );
  const mediaRepository = wrap(new PrismaMediaRepository(db, hooks), [
    'insert',
    'update',
    'delete',
  ]);
  const avatarDirectory = new PrismaAvatarDirectory(db);
  const rateLimits = new PrismaRateLimitStore(db);
  const privacyRepository = wrap(
    new PrismaPrivacyRepository(
      db,
      secrets,
      regeneratePermalinks,
      permalinkTokens,
    ),
    ['erase'],
  );
  const searchSource = new PrismaSearchSource(db, activeContentTypes);
  const permalinkRepository = wrap(
    new PrismaPermalinkRepository(db, permalinkTokens, logger),
    ['addRedirect', 'saveSettings', 'resume'],
  );
  const archiveStore = wrap(new PrismaArchivePaths(db), ['save']);
  const siteWriter = wrap(new PrismaSiteSettingsWriter(db), ['save']);
  const discoveryRepository = new PrismaSeoDiscoveryRepository(
    db,
    activeContentTypes,
  );
  const revisions = new PrismaRevisionRepository(db);
  const jobQueue = new PrismaJobQueue(db, uuidV7, secrets);

  await jobQueue.sealLegacy();
  const taskLeases = new PrismaTaskLeases(db);
  const mediaKeyCatchUp = new PrismaMediaKeyCatchUp(db);
  const users = new PrismaUserRepository(db);
  const sessions = new PrismaSessionRepository(db);
  const passwordTokens = new PrismaPasswordTokenRepository(db);
  const apiTokenRepository = new PrismaApiTokenRepository(db);
  const directory = wrap(
    new PrismaUserDirectory(
      db,
      roleExists,
      regeneratePermalinks,
      permalinkTokens,
    ),
    ['insert', 'update', 'updateProfile', 'delete'],
  );
  const passwordCredentials = new PrismaCredentialRepository(db);
  const totpSecrets = new PrismaTotpRepository(db);
  const storageTransactions = wrap(new PrismaSettingsTransactions(db), ['run']);
  const cleanupCatalog = new PrismaCleanupCatalog(db);
  const cleanupTransactions = wrap(new PrismaSettingsTransactions(db), ['run']);
  const resyncTransactions = wrap(new PrismaSettingsTransactions(db), ['run']);
  const profileRepository = new PrismaProfileMeta(db);
  const commentRepository = wrap(new PrismaCommentRepository(db), [
    'insert',
    'update',
    'setStatus',
    'delete',
    'purge',
  ]);
  const noticeState = new PrismaCommentNoticeState(db, uuidV7);
  const subscriptions = new PrismaPushSubscriptionRepository(db);
  const noticeOutbox = new PrismaNoticeOutbox(db, uuidV7);
  const vapidTransactions = wrap(new PrismaSettingsTransactions(db), ['run']);
  const ssoSettingsAccess = new PrismaSsoAccessTransactions(db);
  const ssoAccess = new PrismaSsoAccessTransactions(db);
  const ssoIdentities = new PrismaIdentityRepository(db);
  const ssoTransactions = new PrismaSsoTransactionRepository(db);
  const ssoLogoutSessions = new PrismaSsoLogoutSessions(db);
  const recoveryCodes = new PrismaRecoveryCodeRepository(db);
  const pluginData = new PrismaPluginDataRepository(db);
  const signInSettingsTransactions = wrap(new PrismaSettingsTransactions(db), [
    'run',
  ]);
  const methodIdentities = new PrismaIdentityRepository(db);
  const passkeys = new PrismaPasskeyRepository(db);
  const factorCodes = new PrismaRecoveryCodeRepository(db);
  const factorChanges = new PrismaSettingsTransactions(db);
  const signInTransactions = new PrismaSignInTransactions(db);
  const setupTokens = new PrismaSetupTokens(db);
  const pluginState = new PrismaPluginStateRepository(db);
  const expiredCleanup = new PrismaExpiredCleanup(db);
  const cleanupStore = new PrismaDatabaseCleanupStore(db, {
    ...cleanup,
    expired: (now, limit) => expiredCleanup.batch(now, limit),
    expiredCount: (now) => expiredCleanup.count(now),
  });

  return {
    contentRepository,
    settingsRepository,
    patternTransactions,
    patternCatalog,
    taxonomyRepository,
    rawPublishedRepository,
    mediaRepository,
    avatarDirectory,
    rateLimits,
    privacyRepository,
    searchSource,
    permalinkRepository,
    archiveStore,
    siteWriter,
    discoveryRepository,
    revisions,
    jobQueue,
    taskLeases,
    mediaKeyCatchUp,
    users,
    sessions,
    passwordTokens,
    apiTokenRepository,
    directory,
    passwordCredentials,
    totpSecrets,
    storageTransactions,
    cleanupCatalog,
    cleanupTransactions,
    resyncTransactions,
    profileRepository,
    commentRepository,
    noticeState,
    subscriptions,
    noticeOutbox,
    vapidTransactions,
    ssoSettingsAccess,
    ssoAccess,
    ssoIdentities,
    ssoTransactions,
    ssoLogoutSessions,
    recoveryCodes,
    pluginData,
    signInSettingsTransactions,
    methodIdentities,
    passkeys,
    factorCodes,
    factorChanges,
    signInTransactions,
    setupTokens,
    pluginState,
    cleanupStore,
  };
};
