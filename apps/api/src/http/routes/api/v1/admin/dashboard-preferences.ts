import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Only the signed-in writer's options; no user id in the URL or request body. */
export const routes = (app: ApiApp) =>
  session(app, 'content.create')
    .get('', async ({ dashboardPreferences, user, set }) => {
      set.headers['cache-control'] = 'private, no-store';
      return json(await dashboardPreferences.get(user));
    })
    .put('', async ({ dashboardPreferences, request, user }) =>
      json(await dashboardPreferences.update(await readJson(request), user)),
    );
