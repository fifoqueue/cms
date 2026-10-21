// Composition root: the only place that knows every concrete implementation.
import { Elysia } from 'elysia';
import { loadConfig } from './config';
import type { AppConfig } from './config';
import { AuthService } from './domain/auth/auth-service';
import type { SessionRepository, UserRepository } from './domain/auth/ports';
import { InstallationService } from './domain/installation/installation-service';
import { ContentService } from './domain/content/content-service';
import {
  PublicContentService,
  PublishedContentReader,
} from './domain/content/public-content';
import { SiteService } from './domain/site/site-service';
import { createApiApp, createInstallerApp } from './http/app';
import { PluginGateway } from './http/plugin-gateway';
import { SsoClientResolver } from './http/sso-client';
import { errorResponse, json } from './http/respond';
import {
  readInstallationConfig,
  saveInstallationConfig,
} from './infra/installation/config-store';
import { databaseUrl, prepareDatabase } from './infra/installation/database';
import { initializeSite } from './infra/prisma/installation-transaction';
import { FsPluginPackageStore } from './infra/plugins/fs-package-store';
import { dynamicImportLoader } from './infra/plugins/module-loader';
import {
  PrismaSessionRepository,
  PrismaUserRepository,
} from './infra/prisma/auth-repositories';
import { createDatabase } from './infra/prisma/client';
import { PrismaContentRepository } from './infra/prisma/content-repository';
import {
  PrismaPluginDataRepository,
  PrismaPluginStateRepository,
} from './infra/prisma/plugin-repositories';
import { PrismaSettingsRepository } from './infra/prisma/settings-repository';
import {
  bunPasswordHasher,
  randomTokenIssuer,
  systemClock,
  tiptapRenderer,
  uuidV7,
} from './infra/system';
import { HookBus } from './plugin-runtime/hook-bus';
import { PluginContextFactory } from './plugin-runtime/plugin-context-factory';
import { PluginHost } from './plugin-runtime/plugin-host';
import { PluginSettings } from './plugin-runtime/plugin-settings';
import { PluginRouteRegistry } from './plugin-runtime/route-registry';
import { SlotRegistry } from './plugin-runtime/slot-registry';
import { SlotService } from './plugin-runtime/slot-service';
import { consoleLogger } from './shared/logger';
import type { Logger } from './shared/logger';
import { invalidInput } from './shared/errors';
import { SsoService } from './domain/auth/sso-service';
import { MemoryRateLimiter } from './infra/memory-rate-limiter';
import { OpenIdClientProvider } from './infra/oidc/openid-client-provider';
import {
  PrismaIdentityRepository,
  PrismaSsoTransactionRepository,
} from './infra/prisma/sso-repositories';

const createAuth = (
  users: UserRepository,
  sessions: SessionRepository,
  config: AppConfig,
) =>
  new AuthService({
    users,
    sessions,
    hasher: bunPasswordHasher,
    tokens: randomTokenIssuer,
    ids: uuidV7,
    clock: systemClock,
    sessionTtlMs: config.SESSION_TTL_HOURS * 60 * 60 * 1000,
  });

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

export const createContainer = async (
  config: AppConfig & { DATABASE_URL: string },
) => {
  const logger = consoleLogger();
  const timeoutMs = config.PLUGIN_TIMEOUT_MS;
  const db = createDatabase(config.DATABASE_URL);

  const hooks = new HookBus({ timeoutMs, logger });
  const slotRegistry = new SlotRegistry({ timeoutMs, logger });
  const pluginRoutes = new PluginRouteRegistry();

  const contentRepository = new PrismaContentRepository(db);
  const reader = new PublishedContentReader(contentRepository);
  const site = new SiteService(new PrismaSettingsRepository(db), hooks);
  const content = new ContentService({
    repository: contentRepository,
    renderer: tiptapRenderer,
    hooks,
    ids: uuidV7,
    clock: systemClock,
  });
  const users = new PrismaUserRepository(db);
  const auth = createAuth(users, new PrismaSessionRepository(db), config);

  const sso = new SsoService({
    provider: createOidcProvider(config, logger),
    name: config.OIDC_NAME,
    subjects: new Map(Object.entries(config.OIDC_ALLOWED_SUBJECTS)),
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
      routes: pluginRoutes,
      data: pluginData,
      settings: pluginSettings,
      content: reader,
      logger: (pluginId) => consoleLogger(`plugin:${pluginId}`),
    }),
    settings: pluginSettings,
    logger,
    timeoutMs,
  });

  const app = await createApiApp({
    logger,
    services: {
      auth,
      sso,
      ssoClients: new SsoClientResolver(config.OIDC_FRONTEND_SECRET),
      site,
      adminContent: content,
      publicContent: new PublicContentService(reader, hooks),
      slots: new SlotService({ registry: slotRegistry, site, content: reader }),
      plugins,
      pluginGateway: new PluginGateway({
        auth,
        routes: pluginRoutes,
        timeoutMs,
        logger,
      }),
    },
  });

  return { app, plugins, db, logger, auth, hooks };
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

  const connect = async (url: string, persist: boolean) => {
    await prepareDatabase(url);
    const candidate = await createContainer({ ...config, DATABASE_URL: url });

    try {
      await candidate.plugins.boot();
      await candidate.auth.status();
      if (persist) await saveInstallationConfig(url);
      runtime = candidate;
    } catch {
      await candidate.plugins.stop();
      await candidate.db.$disconnect();
      throw invalidInput(
        '설정을 적용하지 못했습니다. DB 연결과 서버의 data 폴더 쓰기 권한을 확인해 주세요.',
      );
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
          await new SiteService(settings, runtime!.hooks).update(input.site);
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
          : errorResponse(
              503,
              'installation_required',
              '먼저 웹사이트에서 설치를 완료해 주세요.',
            ),
      { parse: 'none' },
    );

  return {
    port: config.PORT,
    logger,
    /** Elysia application; call `app.listen({ port })` or pass `app.fetch` to `Bun.serve`. */
    app,
    stop: async () => {
      await runtime?.plugins.stop();
      await runtime?.db.$disconnect();
    },
  };
};
