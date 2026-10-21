import { currentUser, readJson } from '../../../../../request';
import { json } from '../../../../../respond';
import type { ApiApp } from '../../../../../services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, sso, request }) =>
    json(
      await sso.complete(
        await readJson(request),
        await currentUser(auth, request),
      ),
    ),
  );
