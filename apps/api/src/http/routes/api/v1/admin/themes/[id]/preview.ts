import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** A short-lived token that shows this theme on the public site to whoever holds it. */
export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ themePreviews, params, user }) =>
      json(await themePreviews.issue(params.id, user)),
    idParams,
  );
