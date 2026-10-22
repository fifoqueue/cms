import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Replaces the signing secret; the response shows the new one once. */
export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ webhooks, params, user }) =>
      json(await webhooks.rotate(params.id, user)),
    idParams,
  );
