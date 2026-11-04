import { idParams } from '#api/http/params';
import { privateJson } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ previews, params, user }) =>
      privateJson(await previews.create(params.id, user), 201),
    idParams,
  );
