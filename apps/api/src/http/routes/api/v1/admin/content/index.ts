import { CONTENT_BODY_BYTES, readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ adminContent, query, user }) =>
      json(await adminContent.list(query, user)),
    )
    .post('', async ({ adminContent, request, user }) =>
      json(
        await adminContent.create(
          await readJson(request, CONTENT_BODY_BYTES),
          user,
        ),
        201,
      ),
    );
