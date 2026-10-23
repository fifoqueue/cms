import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** `?contentId=`: the previous and next published entries of the same type. */
export const routes = (app: ApiApp) =>
  app.get('', async ({ publicContent, query }) =>
    json(await publicContent.adjacent(query)),
  );
