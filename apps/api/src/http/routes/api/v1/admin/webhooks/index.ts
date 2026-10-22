import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ webhooks, user }) => json(await webhooks.list(user)))
    .post('', async ({ webhooks, request, user }) =>
      json(await webhooks.create(await readJson(request), user), 201),
    );
