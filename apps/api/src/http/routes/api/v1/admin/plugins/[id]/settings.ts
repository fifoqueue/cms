import { idParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'plugins.manage').put(
    '',
    async ({ plugins, params, request }) =>
      json(await plugins.updateSettings(params.id, await readJson(request))),
    idParams,
  );
