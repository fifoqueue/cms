import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'content.create')
    .get('', async ({ taxonomyTypes }) => json(await taxonomyTypes.list()))
    .put('', async ({ taxonomyTypes, request, user }) =>
      json(await taxonomyTypes.save(await readJson(request), user)),
    );
