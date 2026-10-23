import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Labels of the published entries the saved menus link to (`appearance.manage`). */
export const routes = (app: ApiApp) =>
  session(app).get('', async ({ menus, user }) =>
    json(await menus.targets(user)),
  );
