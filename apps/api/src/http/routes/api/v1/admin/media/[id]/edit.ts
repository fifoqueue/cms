import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'media.upload').post(
    '',
    async ({ media, params, request, user }) =>
      json(await media.edit(params.id, await readJson(request), user)),
    idParams,
  );
