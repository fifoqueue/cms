import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get('', async ({ seoDiscovery, query }) =>
    json(await seoDiscovery.list(query)),
  );
