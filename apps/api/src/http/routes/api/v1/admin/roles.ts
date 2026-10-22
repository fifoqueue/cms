import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'users.manage')
    .get('', async ({ roles }) => json(await roles.list()))
    .put('', async ({ roles, request, user }) =>
      json(await roles.save(await readJson(request), user)),
    );
