import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ security }) => json(await security.getAdmin()))
    .put('', async ({ security, request }) =>
      json(await security.update(await readJson(request))),
    );
