import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** The captcha widget a frontend renders; `none` while no verifiable provider is set up. */
export const routes = (app: ApiApp) =>
  app.get('', async ({ security }) => json(await security.getPublic()));
