import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { commentListQuerySchema } from '@cms/sdk';

export const routes = (app: ApiApp) =>
  session(app).get('', async ({ comments, adminUi, query, user }) =>
    json(
      await comments.list(
        adminUi
          ? await adminUi.apply(user, 'comments', query, commentListQuerySchema)
          : query,
        user,
      ),
    ),
  );
