import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ sso, user }) => json(await sso.identity(user)))
    .delete('', async ({ sso, user }) => {
      await sso.unlink(user.id);

      return noContent();
    });
