import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).get(
    '',
    async ({ media, params, user }) =>
      json(await media.context(params.id, user)),
    idParams,
  );
