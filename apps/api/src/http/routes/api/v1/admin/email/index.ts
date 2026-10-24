import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ email }) => email.getAdmin(),
  ({ email }, input) => email.update(input),
);
