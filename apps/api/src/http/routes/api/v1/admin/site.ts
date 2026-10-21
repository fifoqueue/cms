import { readJson } from '../../../../request';
import { json } from '../../../../respond';
import type { ApiApp } from '../../../../services';
import { session } from '../../../../session';

export const routes = (app: ApiApp) =>
  session(app).put('', async ({ site, request }) =>
    json(await site.update(await readJson(request))),
  );
