import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'egress.manage')
    .get('', async ({ egress }) => json(await egress.getAdmin()))
    .put('', async ({ egress, request }) =>
      json(await egress.update(await readJson(request))),
    );
