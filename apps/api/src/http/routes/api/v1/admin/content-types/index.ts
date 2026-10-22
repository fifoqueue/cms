import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Every writer reads the types (the editor needs them); changing them needs `fields.manage`. */
export const routes = (app: ApiApp) =>
  session(app, 'content.create')
    .get('', async ({ contentTypes, fields }) =>
      json({ types: await contentTypes.list(), fields: await fields.list() }),
    )
    .post('', async ({ contentTypes, request, user }) =>
      json(await contentTypes.create(await readJson(request), user), 201),
    );
