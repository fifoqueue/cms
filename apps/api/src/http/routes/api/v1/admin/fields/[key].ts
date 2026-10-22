import { keyParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .put(
      '',
      async ({ fields, params, request, user }) =>
        json(await fields.update(params.key, await readJson(request), user)),
      keyParams,
    )
    .delete(
      '',
      async ({ fields, params, user }) => {
        await fields.remove(params.key, user);
        return noContent();
      },
      keyParams,
    );
