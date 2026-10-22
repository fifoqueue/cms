import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ permalinks }) => json(await permalinks.get()))
    .put('', async ({ permalinks, request }) =>
      json(await permalinks.update(await readJson(request))),
    );
