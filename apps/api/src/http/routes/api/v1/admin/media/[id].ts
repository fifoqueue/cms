import { idParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get(
      '',
      async ({ media, params, user }) => json(await media.get(params.id, user)),
      idParams,
    )
    .put(
      '',
      async ({ media, params, request, user }) =>
        json(await media.update(params.id, await readJson(request), user)),
      idParams,
    )
    // `?force=1` also deletes files still shown by entries.
    .delete(
      '',
      async ({ media, params, query, user }) => {
        await media.remove(params.id, query.force === '1', user);
        return noContent();
      },
      idParams,
    );
