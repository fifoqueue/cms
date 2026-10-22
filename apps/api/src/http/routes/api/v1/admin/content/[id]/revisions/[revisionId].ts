import { revisionParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).get(
    '',
    async ({ contentRevisions, params, user }) =>
      json(await contentRevisions.get(params.id, params.revisionId, user)),
    revisionParams,
  );
