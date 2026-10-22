import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ ssoSettings }) => json(await ssoSettings.getAdmin()))
    .put('', async ({ ssoSettings, request }) =>
      json(await ssoSettings.update(await readJson(request))),
    );
