import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ email }) => json(await email.getAdmin()))
    .put('', async ({ email, request }) =>
      json(await email.update(await readJson(request))),
    );
