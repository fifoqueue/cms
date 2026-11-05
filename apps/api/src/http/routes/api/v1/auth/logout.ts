import { bearerToken } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, request }) => {
    const token = bearerToken(request);

    return json(token ? await auth.logout(token) : { endSessionUrl: null });
  });
