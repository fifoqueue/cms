import { idParams } from '#api/http/params';
import { CONTENT_BODY_BYTES, readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get(
      '',
      async ({ patterns, params, user }) =>
        json(await patterns.get(params.id, user)),
      idParams,
    )
    .put(
      '',
      async ({ patterns, params, request, user }) =>
        json(
          await patterns.update(
            params.id,
            await readJson(request, CONTENT_BODY_BYTES),
            user,
          ),
        ),
      idParams,
    )
    .delete(
      '',
      async ({ patterns, params, user }) => {
        await patterns.remove(params.id, user);
        return noContent();
      },
      idParams,
    );
