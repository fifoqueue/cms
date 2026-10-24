import { settingsRoutes } from '#api/http/settings-routes';

export const routes = settingsRoutes(
  ({ comments }) => comments.discussion(),
  ({ comments, user }, input) => comments.updateDiscussion(input, user),
);
