import { idParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .put(
      '',
      async ({ webhooks, params, request, user }) =>
        json(await webhooks.update(params.id, await readJson(request), user)),
      idParams,
    )
    .delete(
      '',
      async ({ webhooks, params, user }) => {
        await webhooks.remove(params.id, user);
        return noContent();
      },
      idParams,
    );
