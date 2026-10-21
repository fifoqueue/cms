import { idParams } from '../../../../../../params';
import { readJson } from '../../../../../../request';
import { json } from '../../../../../../respond';
import type { ApiApp } from '../../../../../../services';
import { session } from '../../../../../../session';

export const routes = (app: ApiApp) =>
  session(app).put(
    '',
    async ({ plugins, params, request }) =>
      json(await plugins.updateSettings(params.id, await readJson(request))),
    idParams,
  );
