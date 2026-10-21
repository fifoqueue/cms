import { bearerToken } from '../../../../request';
import { noContent } from '../../../../respond';
import type { ApiApp } from '../../../../services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, request }) => {
    const token = bearerToken(request);

    if (token) await auth.logout(token);

    return noContent();
  });
