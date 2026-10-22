import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'users.manage').put('', async ({ users, request, user }) =>
    json(await users.configureMembership(await readJson(request), user)),
  );
