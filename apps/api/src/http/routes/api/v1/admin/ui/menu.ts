import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { adminMenu } from '#api/http/admin-menu';

export const routes = (app: ApiApp) =>
  session(app).get('', async ({ user, pluginPages, renderHooks }) =>
    json(await adminMenu(user, pluginPages, renderHooks)),
  );
