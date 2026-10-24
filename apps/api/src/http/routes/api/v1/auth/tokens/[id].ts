import { revokeRoutes } from '#api/http/auth-revoke-routes';

export const routes = revokeRoutes(({ apiTokens, params, user }) =>
  apiTokens.revoke(params.id, user),
);
