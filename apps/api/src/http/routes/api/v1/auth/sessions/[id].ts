import { revokeRoutes } from '#api/http/auth-revoke-routes';

/** Signs out one of the signed-in user's own sessions. */
export const routes = revokeRoutes(({ auth, params, user }) =>
  auth.revokeSession(user, params.id),
);
