import { bearerToken } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** The signed-in user's own sessions (opaque ids, issue and expiry times). */
export const routes = (app: ApiApp) =>
  session(app).get('', async ({ auth, request, user }) =>
    json(await auth.sessions(user, bearerToken(request) ?? '')),
  );
