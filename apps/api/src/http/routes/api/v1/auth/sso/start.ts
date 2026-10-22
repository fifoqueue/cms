import { currentUser, readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, sso, clients, request }) =>
    json(
      await sso.start(
        await readJson(request),
        await currentUser(auth, request),
        clients.resolve(request),
      ),
    ),
  );
