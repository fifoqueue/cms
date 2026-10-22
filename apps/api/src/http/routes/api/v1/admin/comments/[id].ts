import { idParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .put(
      '',
      async ({ comments, params, request, user }) => {
        await comments.update(params.id, await readJson(request), user);
        return noContent();
      },
      idParams,
    )
    .delete(
      '',
      async ({ comments, params, user }) => {
        await comments.remove(params.id, user);
        return noContent();
      },
      idParams,
    );
