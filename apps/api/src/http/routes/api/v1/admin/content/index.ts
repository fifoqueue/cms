import { readJson } from '../../../../../request';
import { json } from '../../../../../respond';
import type { ApiApp } from '../../../../../services';
import { session } from '../../../../../session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ adminContent, query }) =>
      json(await adminContent.list(query)),
    )
    .post('', async ({ adminContent, request, user }) =>
      json(await adminContent.create(await readJson(request), user.id), 201),
    );
