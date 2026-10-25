import { currentUser, readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  signInRoutes(app).post(
    '',
    async ({ signIn, auth, clients, request }) =>
      json(
        await signIn.continue(
          await readJson(request, SMALL_BODY_BYTES),
          clients.attempt(request),
          (await currentUser(auth, request)) ?? undefined,
        ),
      ),
    { parse: 'none' },
  );
