import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ privacy }) => json(await privacy.settings()))
    .put('', async ({ privacy, user, request }) =>
      json(await privacy.update(await readJson(request), user)),
    );
