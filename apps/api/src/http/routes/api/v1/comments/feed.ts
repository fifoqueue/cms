import type { ApiApp } from '#api/http/services';
import { json } from '#api/http/respond';
export const routes = (app: ApiApp) =>
  app.get('', async ({ comments, query, set }) => {
    set.headers['cache-control'] = 'no-store';
    return json(await comments.feed(query));
  });
