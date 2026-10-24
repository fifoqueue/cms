import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ reading }) => reading.get(),
  ({ reading }, input) => reading.update(input),
);
