import { idParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .put(
      '',
      async ({ users, params, request, user }) =>
        json(await users.update(params.id, await readJson(request), user)),
      idParams,
    )
    // `?reassignTo=<user id>` keeps their content; without it the content is deleted.
    .delete(
      '',
      async ({ users, params, query, user }) => {
        await users.remove(params.id, query, user);

        return noContent();
      },
      idParams,
    );
