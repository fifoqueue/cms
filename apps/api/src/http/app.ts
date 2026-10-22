import { fileURLToPath } from 'node:url';
import { Elysia } from 'elysia';
import { autoload } from 'elysia-autoload';
import type { Logger } from '#api/shared/logger';
import { errorResponse, toErrorResponse } from '#api/http/respond';
import { withApiServices, withInstallerServices } from '#api/http/services';
import type { ApiServices, InstallerServices } from '#api/http/services';
import { Errors } from '#api/shared/errors';

const routesDirectory = (name: string) =>
  fileURLToPath(new URL(`./routes/${name}`, import.meta.url));

/**
 * Each file under the directory is one route file: its path is the URL and it exports
 * `routes = (app) => app.get(...)`. A feature adds a file; nothing else is edited.
 */
const loadRoutes = (directory: string, prefix: string) =>
  autoload({ dir: routesDirectory(directory), prefix, import: 'routes' });

/** Maps every failure, including unmatched routes, to the API error body. Global, so it covers all modules. */
export const apiErrors = (logger: Logger) =>
  new Elysia().onError({ as: 'global' }, ({ code, error }) => {
    if (code === 'NOT_FOUND')
      return errorResponse(404, 'not_found', Errors.RouteNotFound);
    if (code === 'PARSE' || code === 'VALIDATION')
      return errorResponse(400, 'invalid_input', error.message);
    return toErrorResponse(error, logger);
  });

export interface ApiAppDeps {
  services: ApiServices;
  logger: Logger;
}

/** The CMS API: every file under `routes/api`, mounted at `/api`. */
export const createApiApp = async ({ services, logger }: ApiAppDeps) =>
  new Elysia()
    .use(apiErrors(logger))
    .use(withApiServices(services))
    .use(await loadRoutes('api', '/api'));

export interface InstallerAppDeps {
  services: InstallerServices;
  logger: Logger;
}

/** The installer, usable before a database exists: every file under `routes/install`. */
export const createInstallerApp = async ({
  services,
  logger,
}: InstallerAppDeps) =>
  new Elysia()
    .use(apiErrors(logger))
    .use(withInstallerServices(services))
    .use(await loadRoutes('install', '/api/v1/install'));
