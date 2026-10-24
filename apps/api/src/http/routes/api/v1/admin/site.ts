import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ site }) => site.getAdmin(),
  ({ site }, input) => site.update(input),
);
