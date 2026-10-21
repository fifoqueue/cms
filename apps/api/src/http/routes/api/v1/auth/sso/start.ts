import { currentUser, readJson } from '../../../../../request';
import { json } from '../../../../../respond';
import type { ApiApp } from '../../../../../services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, sso, ssoClients, request }) =>
    json(
      await sso.start(
        await readJson(request),
        await currentUser(auth, request),
        ssoClients.resolve(request),
      ),
    ),
  );
