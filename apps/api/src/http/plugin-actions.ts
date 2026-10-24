import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Lifecycle command on an installed plugin (`plugins.manage`); responds with its new state. */
export const pluginAction = (command: 'enable' | 'disable') => (app: ApiApp) =>
  session(app, 'plugins.manage').post(
    '',
    async ({ plugins, params }) => json(await plugins[command](params.id)),
    idParams,
  );
