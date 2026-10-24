import { revokeRoutes } from '#api/http/auth-revoke-routes';

/** Signs the user out everywhere (`users.manage`); their API tokens keep working. */
export const routes = revokeRoutes(
  ({ auth, params, user }) => auth.signOutEverywhere(params.id, user),
  'users.manage',
);
