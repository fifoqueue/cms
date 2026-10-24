import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ security }) => security.getAdmin(),
  ({ security }, input) => security.update(input),
);
