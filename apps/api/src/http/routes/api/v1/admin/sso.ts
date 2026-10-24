import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ ssoSettings }) => ssoSettings.getAdmin(),
  ({ ssoSettings }, input) => ssoSettings.update(input),
);
