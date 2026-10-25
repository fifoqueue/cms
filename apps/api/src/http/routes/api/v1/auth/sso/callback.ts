import { currentUser, readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { signInRoutes } from '#api/http/sign-in-routes';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  signInRoutes(app).post(
    '',
    async ({ auth, sso, request }) =>
      json(
        await sso.complete(
          await readJson(request, SMALL_BODY_BYTES),
          await currentUser(auth, request),
          true,
        ),
      ),
    { parse: 'none' },
  );
