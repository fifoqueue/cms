import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Asks the saved Meilisearch server for its version. */
export const routes = (app: ApiApp) =>
  session(app, 'settings.manage').post('', async ({ search }) =>
    json(await search.test()),
  );
