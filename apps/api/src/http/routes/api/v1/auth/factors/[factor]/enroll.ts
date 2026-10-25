import { json } from '#api/http/respond';
import { factorParams } from '#api/http/params';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { signInRoutes } from '#api/http/sign-in-routes';
import { bearerToken } from '#api/http/request';

export const routes = (app: ApiApp) =>
  session(signInRoutes(app)).post(
    '',
    async ({ signIn, auth, user, params, clients, request }) => {
      await auth.requireRecent(user, bearerToken(request)!);
      return json(
        await signIn.enroll(user, params.factor, clients.attempt(request)),
      );
    },
    { ...factorParams, parse: 'none' },
  );
