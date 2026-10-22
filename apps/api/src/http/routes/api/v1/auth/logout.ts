import { bearerToken } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, request }) => {
    const token = bearerToken(request);

    if (token) await auth.logout(token);

    return noContent();
  });
