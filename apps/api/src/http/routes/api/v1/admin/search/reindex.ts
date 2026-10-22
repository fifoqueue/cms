import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Queues a full rebuild of the index; the database answers searches until it is done. */
export const routes = (app: ApiApp) =>
  session(app, 'settings.manage').post('', async ({ search }) => {
    await search.reindex();
    return noContent();
  });
