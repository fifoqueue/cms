import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** `?year=&month=`: the nearest months with published posts before and after it (calendar). */
export const routes = (app: ApiApp) =>
  app.get('', async ({ publicContent, query }) =>
    json(await publicContent.monthNeighbours(query)),
  );
