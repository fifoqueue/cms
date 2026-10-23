import { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import { PrismaArchivePaths } from '#api/infra/prisma/archive-paths';
// Composition root: the only place that knows every concrete implementation.
import { readFileSync } from 'node:fs';
import { Elysia } from 'elysia';
import { loadConfig } from '#api/config';
import type { AppConfig } from '#api/config';
import { hostname } from 'node:os';
import { ContentLocks } from '#api/domain/content/content-locks';
import { Embeds, vimeo, youtube } from '#api/domain/content/embeds';
import type { HtmlExpander } from '#api/domain/content/embeds';
import { BlockRegistry } from '#api/plugin-runtime/block-registry';
import { ResponsiveImages } from '#api/domain/content/responsive-images';
import { EmbedRegistry } from '#api/plugin-runtime/embed-registry';
import { MediaService } from '#api/domain/media/media-service';
import { ReadingService } from '#api/domain/site/reading-service';
import { WritingService } from '#api/domain/site/writing-service';
import { MenuService } from '#api/domain/appearance/menu-service';
import { ContentTypeService } from '#api/domain/content/content-types';
import { FieldService } from '#api/domain/content/fields';
import { FsMediaStorage } from '#api/infra/fs-media-storage';
import { PrismaMediaRepository } from '#api/infra/prisma/media-repository';
import { sharpImages } from '#api/infra/sharp-images';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { PreviewService } from '#api/domain/content/preview-service';
import { RevisionService } from '#api/domain/content/revision-service';
import { hmacSigner } from '#api/infra/hmac-signer';
import { PrismaRevisionRepository } from '#api/infra/prisma/revision-repository';
import { join } from 'node:path';
import { AuthService } from '#api/domain/auth/auth-service';
import type { AuthServiceDeps } from '#api/domain/auth/auth-service';
import { ApiTokenService } from '#api/domain/auth/api-tokens';
import { PasswordService } from '#api/domain/auth/password-service';
import { EMAIL_JOB, EmailService } from '#api/domain/email/email-service';
import { JobRunner } from '#api/domain/jobs/job-runner';
import { Scheduler } from '#api/domain/jobs/scheduler';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { httpCaptchaVerifier } from '#api/infra/captcha-verifier';
import { API_DIRECTORY } from '#api/infra/installation/config-store';
import { PrismaApiTokenRepository } from '#api/infra/prisma/api-tokens';
import { PrismaJobQueue } from '#api/infra/prisma/job-queue';
import { PrismaPasswordTokenRepository } from '#api/infra/prisma/password-tokens';
import { PrismaCredentialRepository } from '#api/infra/prisma/credentials';
import { PrismaRateLimitStore } from '#api/infra/prisma/rate-limit-store';
import { PrismaTaskLeases } from '#api/infra/prisma/task-leases';
import { aesSecretBox, secretKey } from '#api/infra/secret-box';
import { smtpMailer } from '#api/infra/smtp-mailer';
import type { SessionRepository, UserRepository } from '#api/domain/auth/ports';
import { InstallationService } from '#api/domain/installation/installation-service';
import { ContentService } from '#api/domain/content/content-service';
import {
  PublicContentService,
  PublishedContentReader,
} from '#api/domain/content/public-content';
import { SiteService } from '#api/domain/site/site-service';
import { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { SeoDiscoveryService } from '#api/domain/seo/seo-discovery-service';
import { PermalinkService } from '#api/domain/permalinks/permalink-service';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import { ThemeService } from '#api/domain/theme/theme-service';
import {
  PublicTaxonomyService,
  TaxonomyService,
} from '#api/domain/taxonomy/taxonomy-service';
import { createApiApp, createInstallerApp } from '#api/http/app';
import { PluginGateway } from '#api/http/plugin-gateway';
import { ClientResolver } from '#api/http/client-identity';
import { errorResponse, json } from '#api/http/respond';
import {
  readInstallationConfig,
  saveInstallationConfig,
} from '#api/infra/installation/config-store';
import { databaseUrl, prepareDatabase } from '#api/infra/installation/database';
import { initializeSite } from '#api/infra/prisma/installation-transaction';
import { FsPluginPackageStore } from '#api/infra/plugins/fs-package-store';
import { dynamicImportLoader } from '#api/infra/plugins/module-loader';
import {
  PrismaSessionRepository,
  PrismaUserRepository,
} from '#api/infra/prisma/auth-repositories';
import { createDatabase } from '#api/infra/prisma/client';
import { PrismaContentRepository } from '#api/infra/prisma/content-repository';
import { PrismaPublishedContentRepository } from '#api/infra/prisma/published-content-repository';
import { PrismaTaxonomyRepository } from '#api/infra/prisma/taxonomy-repository';
import { PrismaUserDirectory } from '#api/infra/prisma/user-directory';
import { UserService } from '#api/domain/users/user-service';
import {
  PrismaPluginDataRepository,
  PrismaPluginStateRepository,
} from '#api/infra/prisma/plugin-repositories';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';
import { PrismaSeoDiscoveryRepository } from '#api/infra/prisma/seo-discovery-repository';
import { PrismaPermalinkRepository } from '#api/infra/prisma/permalink-repository';
import {
  bunPasswordHasher,
  httpsUpdateFeed,
  randomTokenIssuer,
  semverPolicy,
  systemClock,
  tiptapHtmlParser,
  tiptapRenderer,
  uuidV7,
} from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { PluginContextFactory } from '#api/plugin-runtime/plugin-context-factory';
import { PluginHost } from '#api/plugin-runtime/plugin-host';
import { PluginSettings } from '#api/plugin-runtime/plugin-settings';
import { PluginRouteRegistry } from '#api/plugin-runtime/route-registry';
import { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import { WidgetRegistry } from '#api/plugin-runtime/widget-registry';
import { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import { WidgetService } from '#api/domain/appearance/widget-service';
import { CommentService } from '#api/domain/comments/comment-service';
import { SearchService } from '#api/domain/search/search-service';
import {
  WEBHOOK_JOB,
  WebhookService,
} from '#api/domain/webhooks/webhook-service';
import { httpWebhookTransport } from '#api/infra/webhook-transport';
import { SiteHealthService } from '#api/domain/tools/site-health';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import { ThemePreviews } from '#api/domain/theme/theme-previews';
import { ImportService } from '#api/domain/tools/import-service';
import { ExportService } from '#api/domain/tools/export-service';
import { fastXmlWxrParser } from '#api/infra/wxr-parser';
import { meilisearchEngine } from '#api/infra/meilisearch-engine';
import { PrismaSearchSource } from '#api/infra/prisma/search-source';
import { PrismaCommentRepository } from '#api/infra/prisma/comment-repository';
import { SlotService } from '#api/plugin-runtime/slot-service';
import { consoleLogger } from '#api/shared/logger';
import type { Logger } from '#api/shared/logger';
import { invalidInput, messageOf, Errors } from '#api/shared/errors';
import { TaxonomyTypeService } from '#api/domain/taxonomy/taxonomy-types';
import { RoleService } from '#api/domain/users/role-service';
import { SsoService } from '#api/domain/auth/sso-service';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import { OpenIdClientProvider } from '#api/infra/oidc/openid-client-provider';
import {
  PrismaIdentityRepository,
  PrismaSsoTransactionRepository,
} from '#api/infra/prisma/sso-repositories';

const createAuth = (
  users: UserRepository,
  sessions: SessionRepository,
  config: AppConfig,
  extras: Pick<AuthServiceDeps, 'protection' | 'apiTokens' | 'roles'> = {},
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

const HOUR = 60 * 60 * 1000;
/** Days an entry stays in the trash before it is deleted for good (WordPress: 30). */
const TRASH_DAYS = 30;

const SSO_TRANSACTION_TTL_MS = 10 * 60 * 1000;

/** Single sign-on is enabled only when the issuer, client id and redirect URI are configured. */
const createOidcProvider = (config: AppConfig, logger: Logger) => {
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
      scope: config.OIDC_SCOPES,
    },
    logger,
  );
};

/** How often each instance applies plugin changes made through other instances. */
const PLUGIN_SYNC_MS = 10_000;

/** The running CMS version, from the API package (plugins' `requires.cms` is checked against it). */
const CMS_VERSION = (
  JSON.parse(readFileSync(join(API_DIRECTORY, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

export const createContainer = async (
  config: AppConfig & { DATABASE_URL: string },
) => {
  const logger = consoleLogger();
  const timeoutMs = config.PLUGIN_TIMEOUT_MS;
  const db = createDatabase(config.DATABASE_URL);

  const hooks = new HookBus({ timeoutMs, logger });
  const slotRegistry = new SlotRegistry({ timeoutMs, logger });
  const widgetRegistry = new WidgetRegistry({ timeoutMs, logger });
  const pluginPages = new AdminPageRegistry({ timeoutMs, logger });
  const dashboardWidgets = new DashboardWidgetRegistry({ timeoutMs, logger });
  const pluginRoutes = new PluginRouteRegistry();
  const embedRegistry = new EmbedRegistry({ timeoutMs, logger });
  // Core providers first; plugins add more and never replace them.
  const embeds = new Embeds(() => [
    youtube,
    vimeo,
    ...embedRegistry.providers(),
  ]);

  const contentRepository = new PrismaContentRepository(db);
  const settingsRepository = new PrismaSettingsRepository(db);
  const taxonomyRepository = new PrismaTaxonomyRepository(db);
  const taxonomyTypes = new TaxonomyTypeService(
    settingsRepository,
    taxonomyRepository,
  );
  const adminTaxonomy = new TaxonomyService({
    types: taxonomyTypes,
    repository: taxonomyRepository,
    ids: uuidV7,
    clock: systemClock,
  });
  const publishedRepository = new PrismaPublishedContentRepository(db);
  const mediaRepository = new PrismaMediaRepository(db);
  const contentTypes = new ContentTypeService(settingsRepository, (type) =>
    contentRepository.typeInUse(type),
  );
  const fields = new FieldService({
    settings: settingsRepository,
    images: (ids) => mediaRepository.publicImages(ids),
  });
  const reader = new PublishedContentReader(publishedRepository);
  const responsiveImages = new ResponsiveImages((ids) =>
    mediaRepository.publicImages(ids),
  );
  const blockRegistry = new BlockRegistry({ timeoutMs, logger });
  /** Body HTML as served: players for embeds, plugin blocks, then responsive images. */
  const served: HtmlExpander = {
    expand: async (html, context) =>
      responsiveImages.expand(
        await blockRegistry.expand(await embeds.expand(html), context),
      ),
  };
  const signer = hmacSigner(
    secretKey(config.CMS_SECRET_KEY, join(API_DIRECTORY, 'data/secret.key')),
  );
  const secrets = aesSecretBox(
    secretKey(config.CMS_SECRET_KEY, join(API_DIRECTORY, 'data/secret.key')),
  );
  const security = new SecuritySettingsService(settingsRepository, secrets);
  const rateLimits = new PrismaRateLimitStore(db);
  const protection = new ProtectionService({
    settings: security,
    store: rateLimits,
    captcha: httpCaptchaVerifier(logger),
    clock: systemClock,
  });
  const search = new SearchService({
    settings: settingsRepository,
    secrets,
    engine: meilisearchEngine,
    source: new PrismaSearchSource(db),
    clock: systemClock,
    logger,
  });
  const locks = new ContentLocks({
    repository: publishedRepository,
    hasher: bunPasswordHasher,
    signer,
    clock: systemClock,
    protection,
  });
  const publicContent = new PublicContentService(
    reader,
    hooks,
    locks,
    served,
    fields,
    contentTypes,
    search,
  );
  const permalinkRepository = new PrismaPermalinkRepository(db);
  const archivePaths = new ArchivePathsService(new PrismaArchivePaths(db));
  const permalinks = new PermalinkService(permalinkRepository);
  const permalinkResolver = new PermalinkResolver(
    permalinkRepository,
    publicContent,
  );
  const site = new SiteService(settingsRepository, hooks, (ids) =>
    mediaRepository.publicImages(ids),
  );
  const reading = new ReadingService(settingsRepository, publishedRepository);
  const writing = new WritingService(settingsRepository);
  const menus = new MenuService({
    archives: archivePaths,
    settings: settingsRepository,
    published: publishedRepository,
    terms: taxonomyRepository,
  });
  const seo = new SeoSettingsService(settingsRepository);
  const seoDiscovery = new SeoDiscoveryService(
    new PrismaSeoDiscoveryRepository(db),
    seo,
  );
  const themes = new ThemeService(
    settingsRepository,
    zipThemeArchive,
    sharpImages,
  );
  const themePreviews = new ThemePreviews({
    themes,
    signer,
    clock: systemClock,
  });
  const owner = `${hostname()}:${process.pid}:${uuidV7.next().slice(-12)}`;
  const revisions = new PrismaRevisionRepository(db);
  const jobQueue = new PrismaJobQueue(db, uuidV7);
  const taskLeases = new PrismaTaskLeases(db);
  const scheduler = new Scheduler({
    leases: taskLeases,
    clock: systemClock,
    logger,
    owner,
  });
  const jobs = new JobRunner({
    queue: jobQueue,
    clock: systemClock,
    logger,
    owner,
  });
  scheduler.add(jobs.task(5000));

  const email = new EmailService({
    settings: settingsRepository,
    secrets,
    mailer: smtpMailer,
    jobs: jobQueue,
  });
  jobs.handle(EMAIL_JOB, (payload) => email.deliver(payload));
  const webhooks = new WebhookService({
    settings: settingsRepository,
    secrets,
    tokens: randomTokenIssuer,
    jobs: jobQueue,
    transport: httpWebhookTransport,
    ids: uuidV7,
    clock: systemClock,
  });
  webhooks.subscribe(hooks.registrar('core:webhooks'));
  jobs.handle(WEBHOOK_JOB, (payload) => webhooks.deliver(payload));

  const users = new PrismaUserRepository(db);
  const sessions = new PrismaSessionRepository(db);
  const passwordTokens = new PrismaPasswordTokenRepository(db);
  const apiTokens = new ApiTokenService({
    tokens: new PrismaApiTokenRepository(db),
    issuer: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
  });
  const directory = new PrismaUserDirectory(db);
  const roles = new RoleService(settingsRepository, directory);
  const auth = createAuth(users, sessions, config, {
    protection,
    apiTokens,
    roles,
  });
  const passwords = new PasswordService({
    users,
    tokens: passwordTokens,
    credentials: new PrismaCredentialRepository(db),
    issuer: randomTokenIssuer,
    hasher: bunPasswordHasher,
    limits: rateLimits,
    email,
    protection,
    clock: systemClock,
    site: async () => ({
      siteUrl: (await seo.getPublic()).siteUrl,
      ...(await site.get()),
    }),
  });

  scheduler.add({
    name: 'maintenance',
    intervalMs: HOUR,
    run: async () => {
      const now = systemClock.now();
      await sessions.deleteExpired(now);
      await passwordTokens.purge(now);
      await rateLimits.purge(now);
    },
  });

  const media = new MediaService({
    repository: mediaRepository,
    storage: new FsMediaStorage(config.MEDIA_DIR),
    images: sharpImages,
    ids: uuidV7,
    clock: systemClock,
    hooks,
    maxBytes: config.MEDIA_MAX_MB * 1024 * 1024,
  });

  const content = new ContentService({
    repository: contentRepository,
    revisions,
    renderer: tiptapRenderer,
    hooks,
    ids: uuidV7,
    clock: systemClock,
    users,
    hasher: bunPasswordHasher,
    types: contentTypes,
    fields,
    blocks: blockRegistry,
  });
  const contentRevisions = new RevisionService({
    content,
    revisions,
    renderer: tiptapRenderer,
    ids: uuidV7,
    clock: systemClock,
  });
  const previews = new PreviewService({
    content,
    revisions,
    renderer: tiptapRenderer,
    signer,
    clock: systemClock,
    embeds: served,
    fields,
  });
  scheduler.add({
    name: 'content.publishScheduled',
    intervalMs: 60_000,
    run: () => content.publishDue(),
  });
  scheduler.add({
    name: 'content.emptyTrash',
    intervalMs: 6 * HOUR,
    run: () => content.emptyTrash(TRASH_DAYS),
  });
  const userAdmin = new UserService({
    roles,
    settings: settingsRepository,
    protection,
    users,
    directory,
    hasher: bunPasswordHasher,
    tokens: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
    // `comments` is created below; the avatar is only read on requests.
    avatar: (key) => comments.avatar(key),
    invitations: {
      available: () => email.enabled(),
      send: (user) => passwords.invite(user),
    },
  });

  const commentRepository = new PrismaCommentRepository(db);
  const comments = new CommentService({
    locks,
    signer,
    digest: randomTokenIssuer.digest,
    roles,
    repository: commentRepository,
    settings: settingsRepository,
    types: contentTypes,
    protection,
    hooks,
    email,
    users: directory,
    site: async () => ({
      siteUrl: (await seo.getPublic()).siteUrl,
      ...(await site.get()),
    }),
    ids: uuidV7,
    clock: systemClock,
  });
  scheduler.add({
    name: 'search.sync',
    intervalMs: 5_000,
    run: () => search.sync(),
  });
  scheduler.add({
    name: 'comments.purge',
    intervalMs: 6 * HOUR,
    run: () => comments.purge(),
  });
  const widgets = new WidgetService({
    settings: settingsRepository,
    published: publishedRepository,
    terms: taxonomyRepository,
    menus,
    comments,
    plugins: widgetRegistry,
  });

  const ssoProvider = createOidcProvider(config, logger);
  const ssoSettings = new SsoSettingsService({
    settings: settingsRepository,
    secrets,
    siteUrl: async () => (await seo.getPublic()).siteUrl,
    connect: (client) => new OpenIdClientProvider(client, logger),
    environment: ssoProvider && {
      provider: ssoProvider,
      name: config.OIDC_NAME,
      subjects: new Map(Object.entries(config.OIDC_ALLOWED_SUBJECTS)),
    },
  });
  const sso = new SsoService({
    setup: () => ssoSettings.setup(),
    users,
    identities: new PrismaIdentityRepository(db),
    transactions: new PrismaSsoTransactionRepository(db),
    sessions: auth,
    tokens: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
    transactionTtlMs: SSO_TRANSACTION_TTL_MS,
    admission: {
      total: config.OIDC_MAX_PENDING_REQUESTS,
      perClient: config.OIDC_MAX_PENDING_PER_CLIENT,
    },
    startLimiter: new MemoryRateLimiter({
      clock: systemClock,
      perKey: config.OIDC_STARTS_PER_MINUTE_PER_CLIENT,
      total: config.OIDC_STARTS_PER_MINUTE,
      windowMs: 60_000,
    }),
  });

  const pluginData = new PrismaPluginDataRepository(db);
  const pluginSettings = new PluginSettings(pluginData);
  const plugins = new PluginHost({
    state: new PrismaPluginStateRepository(db),
    packages: new FsPluginPackageStore(config.PLUGINS_DIR),
    loader: dynamicImportLoader,
    contexts: new PluginContextFactory({
      hooks,
      slots: slotRegistry,
      widgets: widgetRegistry,
      embeds: embedRegistry,
      blocks: blockRegistry,
      scheduler,
      pages: pluginPages,
      dashboardWidgets,
      routes: pluginRoutes,
      data: pluginData,
      settings: pluginSettings,
      content: reader,
      logger: (pluginId) => consoleLogger(`plugin:${pluginId}`),
    }),
    settings: pluginSettings,
    versions: semverPolicy(CMS_VERSION),
    updates: httpsUpdateFeed,
    logger,
    timeoutMs,
  });

  const importer = new ImportService({
    parser: fastXmlWxrParser,
    html: tiptapHtmlParser,
    content,
    taxonomy: adminTaxonomy,
    types: contentTypes,
    comments: commentRepository,
    users: directory,
    ids: uuidV7,
    clock: systemClock,
    redirects: permalinkRepository,
    menus,
    accounts: userAdmin,
    tokens: randomTokenIssuer,
  });
  const exporter = new ExportService({
    content: contentRepository,
    terms: taxonomyRepository,
    comments: commentRepository,
    users: directory,
    site: async () => ({
      title: (await site.get()).title,
      siteUrl: (await seo.getPublic()).siteUrl,
    }),
  });
  // Derived from the secret key, so every instance agrees without storing it. The web server
  // fetches it once an administrator signs in (unless both sides set CMS_FRONTEND_SECRET).
  const frontendSecret =
    config.CMS_FRONTEND_SECRET ??
    config.OIDC_FRONTEND_SECRET ??
    signer.sign('frontend-secret');
  const clients = new ClientResolver(frontendSecret);
  const siteHealth = new SiteHealthService({
    siteUrl: async () => (await seo.getPublic()).siteUrl,
    emailEnabled: () => email.enabled(),
    search: () => search.status(),
    leases: taskLeases,
    jobs: jobQueue,
    plugins: () => plugins.list(),
    visitorProof: () => clients.proven,
    info: {
      cms: CMS_VERSION,
      runtime: `Bun ${Bun.version}`,
      database: async () =>
        (
          await db.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`
        )[0]?.version ?? 'unknown',
    },
    clock: systemClock,
  });

  const app = await createApiApp({
    logger,
    services: {
      auth,
      sso,
      clients,
      ssoSettings,
      frontendSecret,
      site,
      seo,
      seoDiscovery,
      archivePaths,
      permalinks,
      permalinkResolver,
      themes,
      adminTaxonomy,
      taxonomyTypes,
      publicTaxonomy: new PublicTaxonomyService(
        taxonomyRepository,
        taxonomyTypes,
      ),
      adminContent: content,
      reading,
      writing,
      menus,
      widgets,
      comments,
      search,
      pluginPages,
      pluginBlocks: blockRegistry,
      dashboardWidgets,
      webhooks,
      siteHealth,
      themePreviews,
      importer,
      exporter,
      contentTypes,
      fields,
      media,
      contentRevisions,
      previews,
      users: userAdmin,
      roles,
      passwords,
      apiTokens,
      security,
      email,
      publicContent,
      slots: new SlotService({
        registry: slotRegistry,
        site,
        content: reader,
        paths: permalinkRepository,
      }),
      plugins,
      pluginGateway: new PluginGateway({
        auth,
        routes: pluginRoutes,
        timeoutMs,
        logger,
      }),
    },
  });

  return { app, plugins, db, logger, auth, hooks, scheduler };
};

/** Starts the installer without a database; switches to the CMS after configuration. */
export const createBootstrap = async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ?? readInstallationConfig()?.DATABASE_URL,
  });
  const logger = consoleLogger();
  let runtime: Awaited<ReturnType<typeof createContainer>> | undefined;
  let reconciling: ReturnType<typeof setInterval> | undefined;

  const connect = async (url: string, persist: boolean) => {
    await prepareDatabase(url);
    const candidate = await createContainer({ ...config, DATABASE_URL: url });

    try {
      await candidate.plugins.boot();
      await candidate.auth.status();
      if (persist) await saveInstallationConfig(url);
      runtime = candidate;
      runtime.scheduler.start(config.SCHEDULER_INTERVAL_MS);
      // Every instance follows plugin changes made through the others.
      reconciling = setInterval(
        () =>
          void candidate.plugins
            .reconcile()
            .catch((error: unknown) =>
              logger.warn(`Plugin sync failed: ${messageOf(error)}`),
            ),
        PLUGIN_SYNC_MS,
      );
    } catch {
      await candidate.plugins.stop();
      await candidate.db.$disconnect();
      throw invalidInput(Errors.InstallApplyFailed);
    }
  };

  if (config.DATABASE_URL) await connect(config.DATABASE_URL, false);

  const token = randomTokenIssuer.issue();
  const tokenHash = randomTokenIssuer.digest(token);

  const installation = new InstallationService(
    {
      configured: () => runtime !== undefined,
      setupRequired: async () => (await runtime!.auth.status()).setupRequired,
      configure: (input) => connect(databaseUrl(input), true),
      complete: async (input) =>
        initializeSite(runtime!.db, async ({ users, sessions, settings }) => {
          const auth = createAuth(users, sessions, config);
          const grant = await auth.setup(input.admin);
          // A new site has no media library yet, so no icon or logo can be chosen.
          await new SiteService(
            settings,
            runtime!.hooks,
            async () => new Map(),
          ).update(input.site);
          return grant;
        }),
    },
    (value) => randomTokenIssuer.digest(value) === tokenHash,
  );

  if ((await installation.status()).setupRequired)
    logger.info(`첫 설치: 웹사이트에 접속한 뒤 설치 키를 입력하세요: ${token}`);

  const installer = await createInstallerApp({
    logger,
    services: { installation },
  });

  // The CMS runtime exists only after installation, so it is mounted behind a catch-all
  // that resolves it per request. Static routes take precedence over the wildcard.
  const app = new Elysia()
    .get('/api/health', () => json({ ok: true }))
    .all(
      '/api/v1/install/*',
      async ({ request }) => {
        const response = await installer.handle(request);
        response.headers.set('cache-control', 'no-store');

        return response;
      },
      { parse: 'none' },
    )
    .all(
      '*',
      ({ request }) =>
        runtime
          ? runtime.app.handle(request)
          : errorResponse(503, 'installation_required', Errors.InstallRequired),
      { parse: 'none' },
    );

  return {
    port: config.API_PORT,
    hostname: config.API_HOST,
    /** Room for the largest media upload and WordPress import (64 MB, like the web server). */
    maxRequestBodySize: Math.max(config.MEDIA_MAX_MB + 1, 64) * 1024 * 1024,
    logger,
    /** Elysia application; call `app.listen({ port })` or pass `app.fetch` to `Bun.serve`. */
    app,
    stop: async () => {
      runtime?.scheduler.stop();
      clearInterval(reconciling);
      await runtime?.plugins.stop();
      await runtime?.db.$disconnect();
    },
  };
};
