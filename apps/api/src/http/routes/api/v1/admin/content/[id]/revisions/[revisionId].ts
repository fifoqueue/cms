import { revisionParams } from '#api/http/params';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get(
      '',
      async ({ contentRevisions, params, user }) =>
        json(await contentRevisions.get(params.id, params.revisionId, user)),
      revisionParams,
    )
    .delete(
      '',
      async ({ contentRevisions, params, user }) => {
        await contentRevisions.delete(params.id, params.revisionId, user);
        return noContent();
      },
      revisionParams,
    );
