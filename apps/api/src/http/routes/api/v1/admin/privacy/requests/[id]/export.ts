import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { idParams } from '#api/http/params';
export const routes = (app: ApiApp) =>
  session(app, 'users.manage').post(
    '',
    async ({ privacy, user, params }) =>
      new Response(await privacy.export(params.id, user), {
        headers: {
          'content-type': 'application/json',
          'content-disposition': 'attachment; filename=personal-data.json',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      }),
    idParams,
  );
