import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ signInSettings }) => signInSettings.getAdmin(),
  ({ signInSettings, user }, input) => signInSettings.update(input, user),
);
