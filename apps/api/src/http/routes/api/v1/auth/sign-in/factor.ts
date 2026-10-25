import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  signInRoutes(app).post(
    '',
    async ({ signIn, clients, request }) =>
      json(
        await signIn.chooseFactor(
          await readJson(request, SMALL_BODY_BYTES),
          clients.attempt(request),
        ),
      ),
    { parse: 'none' },
  );
