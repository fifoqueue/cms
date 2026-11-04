import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { bearerToken } from '#api/http/request';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  session(signInRoutes(app), 'settings.manage')
    .get('', async ({ recovery, user }) => json(await recovery.status(user)))
    .post('', async ({ recovery, user, request }) =>
      json(await recovery.generate(user, bearerToken(request)!)),
    )
    .delete('', async ({ recovery, user }) => {
      await recovery.remove(user);

      return noContent();
    });
