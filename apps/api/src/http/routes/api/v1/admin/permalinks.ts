import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ permalinks }) => permalinks.get(),
  ({ permalinks }, input) => permalinks.update(input),
);
