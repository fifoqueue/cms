import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** `?limit=`: months with published posts, newest first (monthly archives). */
export const routes = (app: ApiApp) =>
  app.get('', async ({ publicContent, query }) =>
    json(await publicContent.months(query)),
  );
