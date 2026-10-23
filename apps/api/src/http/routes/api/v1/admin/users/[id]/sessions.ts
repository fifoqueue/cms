import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Signs the user out everywhere (`users.manage`); their API tokens keep working. */
export const routes = (app: ApiApp) =>
  session(app, 'users.manage').delete(
    '',
    async ({ auth, params, user }) => {
      await auth.signOutEverywhere(params.id, user);
      return noContent();
    },
    idParams,
  );
