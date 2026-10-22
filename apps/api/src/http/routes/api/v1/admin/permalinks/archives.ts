import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
export const routes = (app: ApiApp) =>
  session(app, 'settings.manage').put('', async ({ archivePaths, request }) =>
    json(await archivePaths.update(await readJson(request))),
  );
