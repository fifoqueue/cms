import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, clients, request }) =>
    json(
      await auth.login(
        await readJson(request, SMALL_BODY_BYTES),
        clients.attempt(request),
      ),
    ),
  );
