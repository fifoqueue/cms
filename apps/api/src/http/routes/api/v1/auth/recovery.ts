import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  signInRoutes(app).post('', async ({ recovery, clients, request }) =>
    json(
      await recovery.recover(
        await readJson(request, SMALL_BODY_BYTES),
        clients.attempt(request),
      ),
    ),
  );
