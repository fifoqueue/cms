import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Signs out one of the signed-in user's own sessions. */
export const routes = (app: ApiApp) =>
  session(app).delete(
    '',
    async ({ auth, params, user }) => {
      await auth.revokeSession(user, params.id);
      return noContent();
    },
    idParams,
  );
