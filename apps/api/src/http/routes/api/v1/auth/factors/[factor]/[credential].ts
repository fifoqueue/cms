import { noContent } from '#api/http/respond';
import { factorCredentialParams } from '#api/http/params';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { signInRoutes } from '#api/http/sign-in-routes';

export const routes = (app: ApiApp) =>
  session(signInRoutes(app)).delete(
    '',
    async ({ signIn, user, params }) => {
      await signIn.removeFactor(user, params.factor, params.credential);
      return noContent();
    },
    factorCredentialParams,
  );
