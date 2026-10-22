import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ seo }) => json(await seo.getAdmin()))
    .put('', async ({ seo, request }) =>
      json(await seo.update(await readJson(request))),
    );
