import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', ({ user }) => json(user))
    .put('', async ({ users, request, user }) =>
      json(await users.updateProfile(await readJson(request), user)),
    );
