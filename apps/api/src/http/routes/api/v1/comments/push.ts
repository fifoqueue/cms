import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** A visitor's browser for push replies to the comment its `pushToken` names (rate limited). */
export const routes = (app: ApiApp) =>
  app.post('', async ({ commentNotifier, clients, request, set }) => {
    set.headers['cache-control'] = 'private, no-store';
    return json(
      await commentNotifier.registerVisitor(
        await readJson(request, SMALL_BODY_BYTES),
        clients.attempt(request).client,
      ),
    );
  });
