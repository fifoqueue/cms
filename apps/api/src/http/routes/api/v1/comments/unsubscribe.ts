import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Follows an unsubscribe link from a reply email (rate limited). */
export const routes = (app: ApiApp) =>
  app.post('', async ({ commentNotifier, clients, request, set }) => {
    set.headers['cache-control'] = 'private, no-store';
    return json(
      await commentNotifier.unsubscribe(
        await readJson(request, SMALL_BODY_BYTES),
        clients.attempt(request).client,
      ),
    );
  });
