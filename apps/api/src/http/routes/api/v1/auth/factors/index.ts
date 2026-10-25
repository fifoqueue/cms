import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  session(signInRoutes(app)).get('', async ({ signIn, user }) =>
    json(await signIn.factors(user)),
  );
