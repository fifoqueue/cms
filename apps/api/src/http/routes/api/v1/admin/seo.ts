import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ seo }) => seo.getAdmin(),
  ({ seo }, input) => seo.update(input),
);
