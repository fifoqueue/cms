import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ reading }) => json(await reading.get()))
    .put('', async ({ reading, request }) =>
      json(await reading.update(await readJson(request))),
    );
