import {
  createPersistence,
  createSecrets,
  CMS_VERSION,
} from '#api/composition/persistence';
import { createSecurity } from '#api/composition/security';
import { createRegistries } from '#api/composition/registries';
import { createAdminUiAccess } from '#api/composition/admin-ui';
import { createRepositories } from '#api/composition/repositories';
import { createContent } from '#api/composition/content';
import { createSite } from '#api/composition/site';
import { createJobs } from '#api/composition/jobs';
import { createEmail } from '#api/composition/email';
import { createWebhooks } from '#api/composition/webhooks';
import { createTools, createCleanup } from '#api/composition/tools';
import { createHealth } from '#api/composition/health';
import { createPrivacy, registerPrivacy } from '#api/composition/privacy';
import { createMedia } from '#api/composition/media';
import { createUsers } from '#api/composition/users';
import { createComments } from '#api/composition/comments';
import { createSignIn } from '#api/composition/sign-in';
import { createPlugins } from '#api/composition/plugins';
import { createFunctions } from '#api/composition/functions';
import { createHttp } from '#api/composition/http';
import { createLatePorts } from '#api/composition/late';
import type { AppConfig } from '#api/config';
import { consoleLogger } from '#api/shared/logger';

export const createContainer = async (
  config: AppConfig & { DATABASE_URL: string },
) => {
  const logger = consoleLogger();
  const late = createLatePorts();
  const timeoutMs = config.PLUGIN_TIMEOUT_MS;
  const infra = createPersistence(config.DATABASE_URL);
  const registries = createRegistries({
    timeoutMs,
    logger,
    publicCache: infra.publicCache,
  });
  const keys = createSecrets(config);
  const repositories = await createRepositories({
    ...infra,
    ...registries,
    ...keys,
    logger,
    ...late.repositories,
  });
  const security = createSecurity({
    avatarSiteUrl: async () => (await site.seo.getPublic()).siteUrl,
    ...repositories,
    ...registries,
    ...keys,
    allowlist: config.CMS_EGRESS_ALLOWLIST,
    timeoutMs,
    logger,
  });

  registerPrivacy(registries.privacyErasers, repositories.privacyRepository);
  const content = createContent({
    ...repositories,
    ...registries,
    ...security,
    ...keys,
    ...late.reading,
    publicCache: infra.publicCache,
  });

  late.types.set(content.activeContentTypes);
  late.content.set(content.content);
  const site = createSite({
    ...repositories,
    ...registries,
    ...content,
    ...keys,
    timeoutMs,
    logger,
    reconcileFunctions: late.reconcileFunctions,
  });

  late.writing.set(site.writing);
  late.site.set(site.site);
  const platform = createJobs({
    jobQueue: repositories.jobQueue,
    taskLeases: repositories.taskLeases,
    mediaKeyCatchUp: repositories.mediaKeyCatchUp,
    sessions: repositories.sessions,
    passwordTokens: repositories.passwordTokens,
    totpSecrets: repositories.totpSecrets,
    rateLimits: repositories.rateLimits,
    secrets: keys.secrets,
    hooks: registries.hooks,
    logger,
  });

  late.scheduler.set(platform.scheduler);
  await platform.catchUp();
  content.schedulePermalinks(platform.scheduler);
  const delivery = await createEmail({
    i18n: registries.i18n,
    egress: security.egress,
    access: security.access,
    egressFetch: security.egressFetch,
    checkUrl: security.checkUrl,
    hooks: registries.hooks,
    settings: repositories.settingsRepository,
    secrets: keys.secrets,
    sealedJobs: platform.sealedJobs,
    logger,
    search: security.search,
    jobs: platform.jobs,
  });
  const webhooks = createWebhooks({
    hooks: registries.hooks,
    settings: repositories.settingsRepository,
    secrets: keys.secrets,
    sealedJobs: platform.sealedJobs,
    logger,
    egressFetch: security.egressFetch,
    checkUrl: security.checkUrl,
    jobs: platform.jobs,
  });
  const users = createUsers({
    publicCache: infra.publicCache,
    ...repositories,
    ...registries,
    ...security,
    ...site,
    ...platform,
    ...delivery,
    config,
    logger,
    ...late.users,
  });

  platform.maintenance();
  const media = createMedia({
    ...repositories,
    ...registries,
    ...infra,
    ...keys,
    ...security,
    ...platform,
    config,
    logger,
    limits: security.mediaLimits,
    finalize: late.finalize,
  });

  late.media.set(media.media);
  content.scheduleContent(platform.scheduler);
  const comments = createComments({
    ...repositories,
    ...registries,
    ...content,
    ...site,
    ...security,
    ...users,
    ...platform,
    ...keys,
    ...delivery,
    logger,
    discussion: late.discussion,
  });

  late.comments.set(comments.comments);
  users.registerJobs(platform.jobs);
  security.schedule(platform.scheduler);
  comments.schedulePurge();
  const signIn = createSignIn({
    ...repositories,
    ...registries,
    ...security,
    ...users,
    ...site,
    ...keys,
    config,
    logger,
    otherMethod: late.otherMethod,
  });

  late.signIn.set(signIn.signInSettings);
  late.endSession.set(signIn.endSession);
  const plugins = createPlugins({
    ...registries,
    ...repositories,
    ...platform,
    ...site,
    ...security,
    ...signIn,
    ...content,
    ...infra,
    mailTransports: delivery.delivery.mailer,
    directory: config.PLUGINS_DIR,
    version: CMS_VERSION,
    logger,
    timeoutMs,
  });
  const functions = createFunctions({
    hooks: registries.hooks,
    directory: config.FUNCTIONS_DIR,
    enabled: config.FUNCTIONS_EDITOR_ENABLED,
    settings: repositories.settingsRepository,
    themes: site.themes,
    contexts: plugins.contexts,
    logger,
    invalidate: infra.invalidate,
  });

  late.functions.set(functions.functionsHost);
  const http = createHttp({
    assets: registries.assets,
    hooks: registries.hooks,
    config,
    signer: keys.signer,
    logger,
    timeoutMs,
    routes: registries.pluginRoutes,
    slots: {
      registry: registries.slotRegistry,
      site: site.site,
      content: content.reader,
      paths: repositories.permalinkRepository,
    },
  });
  const tools = createTools({
    importShortcodes: registries.importShortcodes,
    media: media.media,
    settings: repositories.settingsRepository,
    hooks: registries.hooks,
    content: content.content,
    taxonomy: content.adminTaxonomy,
    types: content.contentTypes,
    comments: repositories.commentRepository,
    users: repositories.directory,
    redirects: repositories.permalinkRepository,
    menus: site.menus,
    accounts: users.userAdmin,
    patterns: content.patterns,
    contentRepository: repositories.contentRepository,
    terms: repositories.taxonomyRepository,
    site: site.site,
    seo: site.seo,
  });
  const siteHealth = createHealth({
    checks: registries.healthChecks,
    leases: repositories.taskLeases,
    jobs: repositories.jobQueue,
    plugins: plugins.list,
    visitorProof: http.visitorProof,
    seo: site.seo,
    email: delivery.email,
    search: security.search,
    scheduler: platform.scheduler,
    version: CMS_VERSION,
    database: infra.databaseVersion,
  });
  const privacy = createPrivacy({
    exporters: registries.privacyExporters,
    erasers: registries.privacyErasers,
    hooks: registries.hooks,
    repository: repositories.privacyRepository,
    settings: repositories.settingsRepository,
    published: content.publishedRepository,
    email: delivery.email,
    signer: keys.signer,
    protection: security.protection,
    site: site.site,
    seo: site.seo,
  });
  const databaseCleanup = createCleanup({
    store: repositories.cleanupStore,
    leases: repositories.taskLeases,
  });

  registries.adminUi.setAccess(
    createAdminUiAccess(
      repositories,
      content.content,
      media.media,
      registries.hooks,
    ),
  );
  const app = await http.assemble({
    i18n: registries.i18n,
    functionsEditor: functions.functionsEditor,
    functionsDirectory: config.FUNCTIONS_DIR,
    ...tools,
    siteHealth,
    privacy,
    databaseCleanup,
    publicCache: infra.publicCache,
    auth: users.auth,
    recovery: users.recovery,
    sso: signIn.sso,
    ssoLogout: signIn.ssoLogout,
    ssoSettings: signIn.ssoSettings,
    signInSettings: signIn.signInSettings,
    signIn: signIn.signIn,
    site: site.site,
    seo: site.seo,
    seoDiscovery: site.seoDiscovery,
    archivePaths: content.archivePaths,
    permalinks: content.permalinks,
    permalinkResolver: content.permalinkResolver,
    themes: site.themes,
    adminTaxonomy: content.adminTaxonomy,
    taxonomyTypes: content.taxonomyTypes,
    publicTaxonomy: content.publicTaxonomy,
    adminContent: content.content,
    reading: site.reading,
    writing: site.writing,
    embedSettings: content.embedSettings,
    dashboardPreferences: site.dashboardPreferences,
    patterns: content.patterns,
    menus: site.menus,
    widgets: comments.widgets,
    comments: comments.comments,
    commentNotifier: comments.commentNotifier,
    avatars: security.avatars,
    search: security.search,
    pluginPages: registries.pluginPages,
    adminUi: registries.adminUi,
    pluginBlocks: registries.blockRegistry,
    dashboardWidgets: registries.dashboardWidgets,
    webhooks,
    themePreviews: site.themePreviews,
    contentTypes: content.contentTypes,
    fields: content.fields,
    media: media.media,
    contentRevisions: content.contentRevisions,
    previews: content.previews,
    users: users.userAdmin,
    roles: users.roles,
    passwords: users.passwords,
    apiTokens: users.apiTokens,
    security: security.security,
    egress: security.egress,
    email: delivery.email,
    publicContent: content.publicContent,
    plugins: plugins.plugins,
  });

  return {
    app,
    plugins: plugins.plugins,
    db: infra.db,
    logger,
    auth: users.auth,
    hooks: registries.hooks,
    scheduler: platform.scheduler,
    functionsWatch: functions.functionsWatch,
  };
};
