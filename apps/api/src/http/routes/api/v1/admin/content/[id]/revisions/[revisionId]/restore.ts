import { revisionParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ contentRevisions, params, user }) =>
      json(await contentRevisions.restore(params.id, params.revisionId, user)),
    revisionParams,
  );
