import { json, noContent } from '../../../../../respond';
import type { ApiApp } from '../../../../../services';
import { session } from '../../../../../session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ sso, user }) => json(await sso.identity(user)))
    .delete('', async ({ sso, user }) => {
      await sso.unlink(user.id);

      return noContent();
    });
