import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** `pushsubscriptionchange` and page-load re-sync; the old endpoint is the capability. */
export const routes = (app: ApiApp) =>
  app.post('', async ({ commentNotifier, clients, request, set }) => {
    set.headers['cache-control'] = 'private, no-store';
    return json(
      await commentNotifier.renew(
        await readJson(request, SMALL_BODY_BYTES),
        clients.attempt(request).client,
      ),
    );
  });
