import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage').get('', ({ menus, user }) =>
    json(menus.types(user)),
  );
