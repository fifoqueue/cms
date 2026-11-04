import { Elysia } from 'elysia';
import { createContainer } from '#api/container';
import { createAuth } from '#api/composition/auth';
import { loadConfig } from '#api/config';
import { InstallationService } from '#api/domain/installation/installation-service';
import { SiteService } from '#api/domain/site/site-service';
import { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { createInstallerApp } from '#api/http/app';
import { errorResponse, json } from '#api/http/respond';
import {
  readInstallationConfig,
  saveInstallationConfig,
} from '#api/infra/installation/config-store';
import { databaseUrl, prepareDatabase } from '#api/infra/installation/database';
import { initializeSite } from '#api/infra/prisma/installation-transaction';
import { randomTokenIssuer } from '#api/infra/system';
import { consoleLogger } from '#api/shared/logger';
import { invalidInput, messageOf, Errors } from '#api/shared/errors';

const PLUGIN_SYNC_MS = 10_000;

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
      await candidate.functionsWatch.start();
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
      await candidate.functionsWatch.stop();
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
  // Static installer routes take precedence; the CMS exists only after installation.
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
    maxRequestBodySize: Math.max(config.MEDIA_MAX_MB + 1, 64) * 1024 * 1024,
    logger,
    app,
    stop: async () => {
      runtime?.scheduler.stop();
      clearInterval(reconciling);
      await runtime?.functionsWatch.stop();
      await runtime?.plugins.stop();
      await runtime?.db.$disconnect();
    },
  };
};
