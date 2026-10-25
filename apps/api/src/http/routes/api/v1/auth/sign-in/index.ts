import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  signInRoutes(app).get('', async ({ signIn }) => json(await signIn.info()));
