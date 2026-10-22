import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ widgets, user }) => json(await widgets.get(user)))
    .put('', async ({ widgets, request, user }) =>
      json(await widgets.update(await readJson(request), user)),
    );
