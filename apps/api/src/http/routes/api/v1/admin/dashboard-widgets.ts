import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Plugin dashboard widgets the signed-in user may see, rendered; failed ones are left out. */
export const routes = (app: ApiApp) =>
  session(app, 'content.create').get('', async ({ dashboardWidgets, user }) =>
    json(await dashboardWidgets.render(user)),
  );
