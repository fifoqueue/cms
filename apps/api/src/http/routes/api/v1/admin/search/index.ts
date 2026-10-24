import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ search }) => search.getAdmin(),
  ({ search }, input) => search.update(input),
);
