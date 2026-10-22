import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'settings.manage')
    .get('', async ({ comments }) => json(await comments.discussion()))
    .put('', async ({ comments, request, user }) =>
      json(await comments.updateDiscussion(await readJson(request), user)),
    );
