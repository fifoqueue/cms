import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Asks the plugin's update address for its latest version. */
export const routes = (app: ApiApp) =>
  session(app, 'plugins.manage').get(
    '',
    async ({ plugins, params }) => json(await plugins.checkUpdate(params.id)),
    idParams,
  );
