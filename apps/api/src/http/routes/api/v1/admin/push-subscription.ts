import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** The signed-in writer's browsers; no user id in the URL or request body. */
export const routes = (app: ApiApp) =>
  session(app, 'content.create')
    .get('', async ({ commentNotifier, set }) => {
      set.headers['cache-control'] = 'private, no-store';
      return json(await commentNotifier.publicKey());
    })
    .put('', async ({ commentNotifier, request, user }) =>
      json(
        await commentNotifier.saveForUser(
          user.id,
          await readJson(request, SMALL_BODY_BYTES),
        ),
      ),
    )
    .delete('', async ({ commentNotifier, request, user }) => {
      await commentNotifier.removeForUser(
        user.id,
        await readJson(request, SMALL_BODY_BYTES),
      );
      return noContent();
    });
