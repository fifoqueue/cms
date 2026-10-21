import { readJson } from '../../../../request';
import { json } from '../../../../respond';
import type { ApiApp } from '../../../../services';

export const routes = (app: ApiApp) =>
  app.post('', async ({ auth, request }) =>
    json(await auth.login(await readJson(request))),
  );
