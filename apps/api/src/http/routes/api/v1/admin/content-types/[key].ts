import { keyParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .put(
      '',
      async ({ contentTypes, params, request, user }) =>
        json(
          await contentTypes.update(params.key, await readJson(request), user),
        ),
      keyParams,
    )
    .delete(
      '',
      async ({ contentTypes, params, user }) => {
        await contentTypes.remove(params.key, user);
        return noContent();
      },
      keyParams,
    );
