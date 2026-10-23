import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ site }) => json(await site.getAdmin()))
    .put('', async ({ site, request }) =>
      json(await site.update(await readJson(request))),
    );
