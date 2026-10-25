import { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import { VisibleContentRepository } from '#api/domain/content/visible-content';
import { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';
import { HealthChecks } from '#api/domain/tools/health-checks';
import { PluginJobs } from '#api/domain/jobs/plugin-jobs';
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
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { SignInSettingsService } from '#api/domain/auth/sign-in-settings';
import { createSsoMethod } from '#api/domain/auth/sso-method';
import { createPasswordMethod } from '#api/domain/auth/password-method';
import {
  createPasskeyMethod,
  createPasskeyFactor,
} from '#api/domain/auth/passkey/passkey';
import { PrismaPasskeyRepository } from '#api/infra/passkey-repository';
import { simpleWebAuthn } from '#api/infra/passkey-webauthn';
import { createTotpFactor } from '#api/domain/auth/totp/totp';
import { resealTotpSecrets } from '#api/domain/auth/totp/maintenance';
import { PrismaTotpRepository } from '#api/infra/totp-repository';
import { totpAlgorithm } from '#api/infra/totp-crypto';
import { createRecoveryFactor } from '#api/domain/auth/recovery-factor';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { PrismaSetupTokens } from '#api/infra/prisma/setup-tokens';
import { PrismaSignInTransactions } from '#api/infra/prisma/sign-in-transactions';
import { createSignInUsers } from '#api/domain/auth/sign-in-users';
import { UserCapabilities } from '#api/domain/users/user-capabilities';
import { CapabilityRegistry } from '#api/domain/users/capability-registry';
import { RoleRegistry } from '#api/domain/users/role-registry';
import { ProfileFields } from '#api/domain/users/profile-fields';
import { ProfileMeta } from '#api/domain/users/profile-meta';
import { PrismaProfileMeta } from '#api/infra/prisma/profile-meta';
import { CaptchaRegistry } from '#api/domain/security/captcha-registry';
import { CORE_CAPTCHA_WIDGETS } from '#api/domain/security/captcha-widgets';
import { EraserRegistry } from '#api/domain/privacy/eraser-registry';
import { ResponsiveImages } from '#api/domain/content/responsive-images';
import { EmbedRegistry } from '#api/plugin-runtime/embed-registry';
import { MediaService } from '#api/domain/media/media-service';
import { ReadingService } from '#api/domain/site/reading-service';
import { WritingService } from '#api/domain/site/writing-service';
import { DashboardPreferencesService } from '#api/domain/dashboard/dashboard-preferences';
import { PrismaPatternCatalog } from '#api/infra/prisma/pattern-catalog';
import { PatternService } from '#api/domain/content/pattern-service';
import { MenuService } from '#api/domain/appearance/menu-service';
import {
  BUILTIN_TYPES,
  ContentTypeService,
} from '#api/domain/content/content-types';
import { ContentTypeRegistry } from '#api/domain/content/content-type-registry';
import { FieldService } from '#api/domain/content/fields';
import { FsMediaStorage } from '#api/infra/fs-media-storage';
import { PrismaMediaRepository } from '#api/infra/prisma/media-repository';
import { sharpImages } from '#api/infra/sharp-images';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { PreviewService } from '#api/domain/content/preview-service';
import { RevisionService } from '#api/domain/content/revision-service';
import { PrivacyService } from '#api/domain/privacy/privacy-service';
import { PrismaPrivacyRepository } from '#api/infra/prisma/privacy-repository';
import { hmacSigner } from '#api/infra/hmac-signer';
import { PrismaRevisionRepository } from '#api/infra/prisma/revision-repository';
import { join } from 'node:path';
import { AuthService } from '#api/domain/auth/auth-service';
import { RecoveryService } from '#api/domain/auth/recovery-service';
import { PrismaRecoveryCodeRepository } from '#api/infra/prisma/auth-repositories';
import type { AuthServiceDeps } from '#api/domain/auth/auth-service';
import { ApiTokenService } from '#api/domain/auth/api-tokens';
import {
  PASSWORD_RESET_REQUEST_JOB,
  PasswordService,
} from '#api/domain/auth/password-service';
import { EMAIL_JOB, EmailService } from '#api/domain/email/email-service';
import { JobRunner } from '#api/domain/jobs/job-runner';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { Scheduler } from '#api/domain/jobs/scheduler';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { EgressSettingsService } from '#api/domain/security/egress-settings';
import { httpCaptchaVerifier } from '#api/infra/captcha-verifier';
import { API_DIRECTORY } from '#api/infra/installation/config-store';
import { PrismaApiTokenRepository } from '#api/infra/prisma/api-tokens';
import { PrismaJobQueue } from '#api/infra/prisma/job-queue';
import { PrismaPasswordTokenRepository } from '#api/infra/prisma/password-tokens';
import { PrismaCredentialRepository } from '#api/infra/prisma/credentials';
import { PrismaRateLimitStore } from '#api/infra/prisma/rate-limit-store';
import { PrismaTaskLeases } from '#api/infra/prisma/task-leases';
import { aesSecretBox, secretKey } from '#api/infra/secret-box';
import { createSmtpMailer } from '#api/infra/smtp-mailer';
import { emailEndpoint } from '#api/infra/http-mailer';
import { createEmailDelivery } from '#api/infra/email-delivery';
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
import { REGISTRATION_JOB, UserService } from '#api/domain/users/user-service';
import {
  PrismaPluginDataRepository,
  PrismaPluginStateRepository,
} from '#api/infra/prisma/plugin-repositories';
import { PrismaSettingsTransactions } from '#api/infra/prisma/settings-transactions';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';
import { PrismaSiteSettingsWriter } from '#api/infra/prisma/site-settings';
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
import { CommentCheckers } from '#api/domain/comments/comment-checkers';
import { MediaProcessors } from '#api/domain/media/media-processors';
import { ImageSizes } from '#api/domain/media/image-sizes';
import { PluginHost } from '#api/plugin-runtime/plugin-host';
import { PluginSettings } from '#api/plugin-runtime/plugin-settings';
import { PluginRouteRegistry } from '#api/plugin-runtime/route-registry';
import { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import { WidgetRegistry } from '#api/plugin-runtime/widget-registry';
import { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import { WidgetService } from '#api/domain/appearance/widget-service';
import { CommentService } from '#api/domain/comments/comment-service';
import { AvatarService } from '#api/domain/comments/avatar-service';
import { SearchService } from '#api/domain/search/search-service';
import {
  WEBHOOK_JOB,
  WebhookService,
} from '#api/domain/webhooks/webhook-service';
import { createHttpWebhookTransport } from '#api/infra/webhook-transport';
import { SiteHealthService } from '#api/domain/tools/site-health';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import { ThemePreviews } from '#api/domain/theme/theme-previews';
import { ImportService } from '#api/domain/tools/import-service';
import { ExportService } from '#api/domain/tools/export-service';
import { fastXmlWxrParser } from '#api/infra/wxr-parser';
import { createMeilisearchEngine } from '#api/infra/meilisearch-engine';
import { PrismaSearchSource } from '#api/infra/prisma/search-source';
import { PrismaCommentRepository } from '#api/infra/prisma/comment-repository';
import { PrismaAvatarDirectory } from '#api/infra/prisma/avatar-directory';
import { GravatarSource } from '#api/infra/gravatar-source';
import { SlotService } from '#api/plugin-runtime/slot-service';
import { consoleLogger } from '#api/shared/logger';
import type { Logger } from '#api/shared/logger';
import { invalidInput, messageOf, Errors } from '#api/shared/errors';
import {
  BUILTIN_TAXONOMIES,
  TaxonomyTypeService,
} from '#api/domain/taxonomy/taxonomy-types';
import { DefinitionRegistry } from '#api/domain/content/definition-registry';
import { taxonomyDefinitionSchema, fieldDefinitionSchema } from '@cms/sdk';
import { RoleService } from '#api/domain/users/role-service';
import { SsoService } from '#api/domain/auth/sso-service';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import { SeoFilterGateway } from '#api/http/seo-filter-gateway';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';
import { MenuTypeRegistry } from '#api/plugin-runtime/menu-type-registry';
import {
  createSearchProviders,
  createSitemapProviders,
  createThemeContributions,
} from '#api/plugin-runtime/discovery-providers';
import { coreMenuTypes } from '#api/domain/appearance/menu-types';
import { patternContributionSchema } from '@cms/sdk/plugin';
import type { PatternContributions } from '@cms/sdk/plugin';
import { OpenIdClientProvider } from '#api/infra/oidc/openid-client-provider';
import type { OidcClientSettings } from '#api/infra/oidc/openid-client-provider';
import { outbound } from '#api/infra/egress-policy';
import type { EgressRule, EgressService } from '@cms/sdk';
import {
  PrismaIdentityRepository,
  PrismaSsoTransactionRepository,
  PrismaSsoAccessTransactions,
} from '#api/infra/prisma/sso-repositories';

const createAuth = (
  users: UserRepository,
  sessions: SessionRepository,
  config: AppConfig,
  extras: Pick<
    AuthServiceDeps,
    'protection' | 'apiTokens' | 'roles' | 'passwordLogin'
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

const HOUR = 60 * 60 * 1000;
/** Days an entry stays in the trash before it is deleted for good (WordPress: 30). */
const TRASH_DAYS = 30;

const SSO_TRANSACTION_TTL_MS = 10 * 60 * 1000;

/** Single sign-on is enabled only when the issuer, client id and redirect URI are configured. */
const createOidcProvider = (
  config: AppConfig,
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
      scope: config.OIDC_SCOPES,
      fetch: fetcher,
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
  const healthChecks = new HealthChecks(timeoutMs);
  const slotRegistry = new SlotRegistry({ timeoutMs, logger });
  const widgetRegistry = new WidgetRegistry({ timeoutMs, logger });
  const pluginPages = new AdminPageRegistry({ timeoutMs, logger });
  const dashboardWidgets = new DashboardWidgetRegistry({
    timeoutMs,
    logger,
    hooks,
  });
  const pluginRoutes = new PluginRouteRegistry();
  const embedRegistry = new EmbedRegistry({ timeoutMs, logger });
  // Core providers first; plugins add more and never replace them.
  const embeds = new Embeds(() => [
    youtube,
    vimeo,
    ...embedRegistry.providers(),
  ]);

  const permalinkTokens = new PermalinkTokenRegistry(config.PLUGIN_TIMEOUT_MS);
  const contentRepository = new PrismaContentRepository(db, permalinkTokens);
  const settingsRepository = new PrismaSettingsRepository(db);
  const blockRegistry = new BlockRegistry({ timeoutMs, logger });
  const patternContributions = new ProviderRegistry<null, PatternContributions>(
    patternContributionSchema,
    { timeoutMs, logger },
  );
  const patterns = new PatternService({
    contributions: patternContributions,
    hooks,
    settings: settingsRepository,
    transactions: new PrismaSettingsTransactions(db),
    catalog: new PrismaPatternCatalog(db),
    renderer: tiptapRenderer,
    ids: uuidV7,
    clock: systemClock,
    blocks: blockRegistry,
  });
  const taxonomyRepository = new PrismaTaxonomyRepository(
    db,
    () => void scheduler.runNow('core:permalink-regeneration'),
    permalinkTokens,
  );
  const taxonomyRegistry = new DefinitionRegistry(
    taxonomyDefinitionSchema,
    BUILTIN_TAXONOMIES,
  );
  const fieldRegistry = new DefinitionRegistry(fieldDefinitionSchema);
  const taxonomyTypes = new TaxonomyTypeService(
    settingsRepository,
    taxonomyRepository,
    taxonomyRegistry,
  );
  const adminTaxonomy = new TaxonomyService({
    content: contentRepository,
    hooks,
    types: taxonomyTypes,
    repository: taxonomyRepository,
    ids: uuidV7,
    clock: systemClock,
  });
  const rawPublishedRepository = new PrismaPublishedContentRepository(db);
  const mediaRepository = new PrismaMediaRepository(db);
  const contentTypeRegistry = new ContentTypeRegistry(BUILTIN_TYPES);
  const contentTypes = new ContentTypeService(
    settingsRepository,
    (type) => contentRepository.typeInUse(type),
    hooks,
    contentTypeRegistry,
  );
  const fields = new FieldService({
    registry: fieldRegistry,
    hooks,
    settings: settingsRepository,
    images: (ids) => mediaRepository.publicImages(ids),
  });
  const activeContentTypes = async () =>
    (await contentTypes.list()).map((type) => type.key);
  const publishedRepository = new VisibleContentRepository(
    rawPublishedRepository,
    activeContentTypes,
  );
  const reader = new PublishedContentReader(publishedRepository);
  const responsiveImages = new ResponsiveImages((ids) =>
    mediaRepository.publicImages(ids),
  );
  /**
   * Body HTML as served: synced patterns first (so blocks inside them are expanded too), then
   * players for embeds, plugin blocks and responsive images.
   */
  const served: HtmlExpander = {
    expand: async (html, context) =>
      responsiveImages.expand(
        await blockRegistry.expand(
          await embeds.expand(await patterns.expand(html)),
          context,
        ),
      ),
  };
  const activeSecret = secretKey(
    config.CMS_SECRET_KEY,
    join(API_DIRECTORY, 'data/secret.key'),
  );
  const signer = hmacSigner(activeSecret);
  const secrets = aesSecretBox(activeSecret, config.CMS_SECRET_KEY_PREVIOUS);
  const avatars = new AvatarService(
    new PrismaAvatarDirectory(db),
    new GravatarSource(),
    signer,
  );
  const security = new SecuritySettingsService(
    settingsRepository,
    secrets,
    hooks,
    () => captchaProviders.list(),
    (id) => captchaProviders.widget(id),
  );
  const egress = new EgressSettingsService(
    settingsRepository,
    config.CMS_EGRESS_ALLOWLIST,
    hooks,
  );
  const access = async (service: EgressService) => ({
    service,
    rules: await egress.rules(service),
  });
  const egressFetch =
    (service: EgressService) =>
    async (input: string | URL | Request, init?: RequestInit) =>
      outbound.fetch(input, init, await access(service));
  const checkUrl = async (service: EgressService, url: string) =>
    outbound.check(url, await access(service));
  const meilisearchEngine = createMeilisearchEngine(egressFetch('search'));
  const rateLimits = new PrismaRateLimitStore(db);
  const captchaProviders = new CaptchaRegistry({ timeoutMs, logger });
  const coreCaptcha = httpCaptchaVerifier(logger);
  for (const id of ['turnstile', 'hcaptcha', 'recaptcha'])
    captchaProviders.registerCore(id, {
      label: id,
      widget: CORE_CAPTCHA_WIDGETS[id],
      verify: (input) => coreCaptcha.verify(input),
    });
  const privacyErasers = new EraserRegistry({ timeoutMs, logger });
  const privacyRepository = new PrismaPrivacyRepository(
    db,
    secrets,
    () => void scheduler.runNow('core:permalink-regeneration'),
    permalinkTokens,
  );
  privacyErasers.registerCore('personal-data', {
    erase: async (request) => {
      await privacyRepository.erase(
        request.id,
        await bunPasswordHasher.hash(randomTokenIssuer.issue()),
        systemClock.now(),
      );
      return { erased: 1, retained: 0 };
    },
  });
  const protection = new ProtectionService({
    hooks,
    signer,
    settings: security,
    store: rateLimits,
    captcha: captchaProviders,
    clock: systemClock,
  });
  const search = new SearchService({
    hooks,
    settings: settingsRepository,
    secrets,
    engine: meilisearchEngine,
    source: new PrismaSearchSource(db, activeContentTypes),
    clock: systemClock,
    logger,
    checkDestination: (url) => checkUrl('search', url),
  });
  const locks = new ContentLocks({
    repository: publishedRepository,
    hasher: bunPasswordHasher,
    signer,
    clock: systemClock,
    protection,
  });
  const { registry: searchEngines, lookup: searchLookup } =
    createSearchProviders(search, { timeoutMs, logger });
  const publicContent = new PublicContentService(
    reader,
    hooks,
    locks,
    served,
    fields,
    contentTypes,
    searchLookup,
    (id) => permalinkRepository.pathsFor(id),
  );
  const permalinkRepository = new PrismaPermalinkRepository(
    db,
    permalinkTokens,
    logger,
  );
  const archivePaths = new ArchivePathsService(new PrismaArchivePaths(db));
  const permalinks = new PermalinkService(permalinkRepository, hooks);
  const permalinkResolver = new PermalinkResolver(
    permalinkRepository,
    publicContent,
  );
  const site = new SiteService(
    settingsRepository,
    hooks,
    (ids) => mediaRepository.publicImages(ids),
    new PrismaSiteSettingsWriter(db),
  );
  const reading = new ReadingService(
    settingsRepository,
    publishedRepository,
    hooks,
  );
  const writing = new WritingService(settingsRepository, hooks);
  const dashboardPreferences = new DashboardPreferencesService(
    settingsRepository,
  );
  const menuItemTypes = new MenuTypeRegistry({ timeoutMs, logger });
  for (const [key, provider] of Object.entries(coreMenuTypes))
    menuItemTypes.registerCore(key, provider);
  const menus = new MenuService({
    taxonomyTypes,
    itemTypes: menuItemTypes,
    hooks,
    archives: archivePaths,
    settings: settingsRepository,
    published: publishedRepository,
    terms: taxonomyRepository,
  });
  const seo = new SeoSettingsService(settingsRepository, hooks);
  const discoveryRepository = new PrismaSeoDiscoveryRepository(
    db,
    activeContentTypes,
  );
  const sitemaps = createSitemapProviders(discoveryRepository, {
    timeoutMs,
    logger,
  });
  const seoDiscovery = new SeoDiscoveryService(
    discoveryRepository,
    seo,
    sitemaps,
  );
  const themeContributions = createThemeContributions({ timeoutMs, logger });
  const themes = new ThemeService(
    settingsRepository,
    zipThemeArchive,
    sharpImages,
    hooks,
    themeContributions,
  );
  const themePreviews = new ThemePreviews({
    themes,
    signer,
    clock: systemClock,
  });
  const owner = `${hostname()}:${process.pid}:${uuidV7.next().slice(-12)}`;
  const revisions = new PrismaRevisionRepository(db);
  const jobQueue = new PrismaJobQueue(db, uuidV7, secrets);
  await jobQueue.sealLegacy();
  const sealedJobs = new SealedJobs(jobQueue, secrets);
  const taskLeases = new PrismaTaskLeases(db);
  const scheduler = new Scheduler({
    leases: taskLeases,
    clock: systemClock,
    logger,
    owner,
  });
  const jobs = new JobRunner({
    hooks,
    queue: jobQueue,
    clock: systemClock,
    logger,
    owner,
  });
  scheduler.add(jobs.task(5000));
  scheduler.add({
    name: 'core:permalink-regeneration',
    intervalMs: 5000,
    run: () => permalinkRepository.resume(),
  });

  const smtp = createSmtpMailer(async (host, port, signal) =>
    outbound.resolveHost(host, port, {
      ...(await access('smtp')),
      signal,
    }),
  );
  const delivery = createEmailDelivery({
    smtp,
    egressFetch,
    checkUrl,
    checkHost: async (service, host, port) =>
      outbound.resolveHost(host, port, await access(service)),
  });
  const email = new EmailService({
    transports: delivery.mailer,
    hooks,
    settings: settingsRepository,
    secrets,
    ...delivery,
    sealedJobs,
  });
  await egress.initialize(async () => {
    const [searchSettings, emailSettings] = await Promise.all([
      search.getAdmin(),
      email.getAdmin(),
    ]);
    const rules: EgressRule[] = [];
    if (searchSettings.host) {
      const url = new URL(searchSettings.host);
      const rule = await outbound.compatibilityRule(
        'search',
        url.hostname,
        url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
      );
      if (rule) rules.push(rule);
    }
    if (emailSettings.transport === 'http') {
      const endpoint = emailEndpoint(emailSettings.http);
      if (endpoint) {
        const url = new URL(endpoint);
        const rule = await outbound.compatibilityRule(
          'email-api',
          url.hostname,
          url.port ? Number(url.port) : 443,
        );
        if (rule) rules.push(rule);
      }
    } else if (emailSettings.smtp.host) {
      const rule = await outbound.compatibilityRule(
        'smtp',
        emailSettings.smtp.host,
        emailSettings.smtp.port,
      );
      if (rule) rules.push(rule);
    }
    return rules;
  });
  jobs.handle(EMAIL_JOB, (payload) => email.deliver(payload));
  const webhooks = new WebhookService({
    hooks,
    settings: settingsRepository,
    secrets,
    tokens: randomTokenIssuer,
    sealedJobs,
    transport: createHttpWebhookTransport(egressFetch('webhook'), (url) =>
      checkUrl('webhook', url),
    ),
    ids: uuidV7,
    clock: systemClock,
  });
  webhooks.subscribe(hooks.core('core:webhooks'));
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
  const roleDefaults = new RoleRegistry();
  const profileFields = new ProfileFields();
  const directory = new PrismaUserDirectory(
    db,
    (key) => roleDefaults.has(key),
    () => void scheduler.runNow('core:permalink-regeneration'),
    permalinkTokens,
  );
  const capabilities = new CapabilityRegistry();
  const roles = new RoleService(
    settingsRepository,
    directory,
    hooks,
    new UserCapabilities(hooks, capabilities, logger),
    capabilities,
    roleDefaults,
  );
  const auth = createAuth(users, sessions, config, {
    passwordLogin: async () =>
      (await signInSettings.effective()).methods.includes('password'),
    protection,
    apiTokens,
    roles,
  });
  const passwords = new PasswordService({
    passwordLogin: async () =>
      (await signInSettings.effective()).methods.includes('password'),
    users,
    tokens: passwordTokens,
    credentials: new PrismaCredentialRepository(db),
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

  const totpSecrets = new PrismaTotpRepository(db);
  scheduler.add({
    name: 'maintenance',
    intervalMs: HOUR,
    run: async () => {
      const now = systemClock.now();
      await sessions.deleteExpired(now);
      await passwordTokens.purge(now);
      const resealed = await resealTotpSecrets({
        secrets: totpSecrets,
        box: secrets,
      });
      logger.info('TOTP secret maintenance', resealed);
      if (resealed.unreadable || resealed.skipped)
        logger.warn(
          'TOTP secrets remain unreadable or changed during maintenance',
          resealed,
        );
      await rateLimits.purge(now);
      await sealedJobs.recover(jobs.kinds());
      await jobs.purge();
    },
  });

  const mediaProcessors = new MediaProcessors(timeoutMs);
  mediaProcessors.registerCore({
    process: ({ bytes, mime }) => sharpImages.clean(bytes, mime),
  });
  const imageSizes = new ImageSizes(logger);
  const media = new MediaService({
    sizes: imageSizes,
    processors: mediaProcessors,
    repository: mediaRepository,
    storage: new FsMediaStorage(config.MEDIA_DIR),
    images: sharpImages,
    ids: uuidV7,
    clock: systemClock,
    hooks,
    limiter: rateLimits,
    limits: async () => (await security.policy()).media,
    maxBytes: config.MEDIA_MAX_MB * 1024 * 1024,
  });

  const content = new ContentService({
    repository: contentRepository,
    renderer: tiptapRenderer,
    hooks,
    ids: uuidV7,
    clock: systemClock,
    users,
    hasher: bunPasswordHasher,
    types: contentTypes,
    fields,
    blocks: blockRegistry,
    defaultCategory: async () => {
      const id = (await writing.get()).defaultCategoryId;
      const term = id && (await taxonomyRepository.findById(id, 'all'));
      return term && term.taxonomy === 'category' ? term.id : null;
    },
  });
  const contentRevisions = new RevisionService({
    hooks,
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
    profiles: new ProfileMeta(profileFields, new PrismaProfileMeta(db)),
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
    // `comments` is created below; the avatar is only read on requests.
    avatar: (key) => comments.avatar(key),
    invitations: {
      available: () => email.enabled(),
      send: (user) => passwords.invite(user),
    },
  });

  const commentRepository = new PrismaCommentRepository(db);
  const commentCheckers = new CommentCheckers(timeoutMs);
  const comments = new CommentService({
    checkers: commentCheckers,
    locks,
    signer,
    avatar: avatars,
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
  jobs.handle(PASSWORD_RESET_REQUEST_JOB, (payload) =>
    passwords.deliverResetRequest(payload),
  );
  jobs.handle(REGISTRATION_JOB, (payload) =>
    userAdmin.completeRegistration(payload),
  );
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
    hooks,
    settings: settingsRepository,
    published: publishedRepository,
    terms: taxonomyRepository,
    menus,
    comments,
    plugins: widgetRegistry,
  });

  const oidcFetch: NonNullable<OidcClientSettings['fetch']> = (url, options) =>
    egressFetch('oidc')(url, options as RequestInit);
  const ssoProvider = createOidcProvider(config, logger, oidcFetch);
  const ssoSettings = new SsoSettingsService({
    environmentRedirectUri: config.OIDC_REDIRECT_URI,
    access: new PrismaSsoAccessTransactions(db),
    otherMethod: (actor, store) => signInSettings.otherUsable(actor, store),
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
      otherMethod: await signInSettings.otherUsable(user, store),
    }),
    access: new PrismaSsoAccessTransactions(db),
    setup: (store) => ssoSettings.setup(store),
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
    startLimiter: ssoStarts,
  });

  const recovery = new RecoveryService({
    sessionRepository: sessions,
    codes: new PrismaRecoveryCodeRepository(db),
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

  const pluginData = new PrismaPluginDataRepository(db);
  const authentication = new SignInRegistry({ timeoutMs, logger });
  const signInSettings = new SignInSettingsService({
    settings: settingsRepository,
    transactions: new PrismaSettingsTransactions(db),
    registry: authentication,
    passwordForced: config.CMS_ALLOW_PASSWORD_LOGIN,
    logger,
  });
  const authUsers = createSignInUsers(users, roles);
  const coreAuth = authentication.core(authUsers);
  coreAuth.signInMethod(
    'sso',
    createSsoMethod({
      setup: () => ssoSettings.setup(),
      identities: new PrismaIdentityRepository(db),
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
      credentials: new PrismaCredentialRepository(db),
    }),
  );
  const passkeyDeps = {
    passkeys: new PrismaPasskeyRepository(db),
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
    createRecoveryFactor(
      new PrismaRecoveryCodeRepository(db),
      randomTokenIssuer,
    ),
  );
  const signIn = new SignInService({
    registry: authentication,
    settings: signInSettings,
    factorChanges: new PrismaSettingsTransactions(db),
    transactions: new PrismaSignInTransactions(db),
    setupTokens: new PrismaSetupTokens(db),
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
    session: async (profile, identityId) => {
      const user = await users.findById(profile.id);
      if (!user) throw invalidInput(Errors.InvalidCredentials);
      return auth.startSession(user, identityId ?? null);
    },
  });
  const pluginSettings = new PluginSettings(pluginData);
  const plugins = new PluginHost({
    hooks,
    state: new PrismaPluginStateRepository(db),
    packages: new FsPluginPackageStore(config.PLUGINS_DIR),
    loader: dynamicImportLoader,
    contexts: new PluginContextFactory({
      roles: roleDefaults,
      profileFields,
      captchaProviders,
      privacyErasers,
      contentTypes: contentTypeRegistry,
      permalinkTokens,
      taxonomies: taxonomyRegistry,
      fields: fieldRegistry,
      capabilities,
      menuItemTypes,
      themeContributions,
      patterns: patternContributions,
      patternRenderer: tiptapRenderer,
      mailTransports: delivery.mailer,
      jobs: new PluginJobs(jobs, sealedJobs, systemClock),
      healthChecks,
      sitemaps,
      searchEngines,
      mediaProcessors,
      imageSizes,
      commentCheckers,
      authentication,
      users: authUsers,
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
    hooks,
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
    patterns,
  });
  const exporter = new ExportService({
    hooks,
    content: contentRepository,
    patterns: () => patterns.exportable(),
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
    checks: healthChecks,
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

  const privacy = new PrivacyService({
    erasers: privacyErasers,
    hooks,
    repository: privacyRepository,
    settings: settingsRepository,
    published: publishedRepository,
    email,
    site: async () => ({
      ...(await site.get()),
      siteUrl: (await seo.getPublic()).siteUrl,
    }),
    signer,
    tokens: randomTokenIssuer,
    hasher: bunPasswordHasher,
    ids: uuidV7,
    clock: systemClock,
    protection,
  });

  const app = await createApiApp({
    logger,
    services: {
      privacy,
      auth,
      recovery,
      sso,
      clients,
      ssoSettings,
      signInSettings,
      signIn,
      frontendSecret,
      site,
      seo,
      seoDiscovery,
      seoFilter: new SeoFilterGateway(
        clients,
        new MemoryRateLimiter({
          clock: systemClock,
          perKey: 6000,
          total: 60000,
          windowMs: 60_000,
        }),
        seo,
      ),
      archivePaths,
      permalinks,
      permalinkResolver,
      themes,
      adminTaxonomy,
      taxonomyTypes,
      publicTaxonomy: new PublicTaxonomyService(
        taxonomyRepository,
        taxonomyTypes,
        hooks,
      ),
      adminContent: content,
      reading,
      writing,
      dashboardPreferences,
      patterns,
      menus,
      widgets,
      comments,
      avatars,
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
      egress,
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
          const seo = new SeoSettingsService(settings);
          await seo.update({
            ...(await seo.getAdmin()),
            siteUrl: input.siteUrl,
          });
          return grant;
        }),
    },
    (value) => randomTokenIssuer.digest(value) === tokenHash,
    () => runtime?.hooks,
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
