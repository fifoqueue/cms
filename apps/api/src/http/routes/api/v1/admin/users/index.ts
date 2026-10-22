import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ users, user }) => json(await users.list(user)))
    .post('', async ({ users, request, user }) =>
      json(await users.create(await readJson(request), user), 201),
    );
