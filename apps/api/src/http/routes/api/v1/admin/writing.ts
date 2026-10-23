import { authorize } from '#api/domain/auth/authorization';
import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  // Writers read the defaults for new entries; changing them is a site setting.
  session(app, 'content.create')
    .get('', async ({ writing }) => json(await writing.get()))
    .put('', async ({ writing, request, user }) => {
      authorize(user, 'settings.manage');
      return json(await writing.update(await readJson(request)));
    });
