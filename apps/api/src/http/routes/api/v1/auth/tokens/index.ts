import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  session(signInRoutes(app))
    .get('', async ({ apiTokens, user }) => json(await apiTokens.list(user)))
    .post('', async ({ apiTokens, request, user }) =>
      json(await apiTokens.create(await readJson(request), user), 201),
    );
