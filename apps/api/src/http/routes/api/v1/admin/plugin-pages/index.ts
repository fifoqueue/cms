import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Plugin admin pages the signed-in user may open. */
export const routes = (app: ApiApp) =>
  session(app).get('', ({ pluginPages, user }) => json(pluginPages.list(user)));
