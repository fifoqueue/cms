import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
export const routes = (app: ApiApp) =>
  session(app, 'users.manage').post(
    '',
    async ({ privacy, user, params, set }) => {
      set.headers['cache-control'] = 'private, no-store';
      await privacy.erase(params.id, user);
      return noContent();
    },
    idParams,
  );
