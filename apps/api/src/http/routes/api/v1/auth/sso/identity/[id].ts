import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { idParams } from '#api/http/params';

export const routes = (app: ApiApp) =>
  session(app).delete(
    '',
    async ({ sso, user, params }) => {
      await sso.unlink(user.id, params.id);
      return noContent();
    },
    idParams,
  );
