import { authorize } from '#api/domain/auth/authorization';
import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ embedSettings, user }) => {
      authorize(user, 'settings.manage');
      return json(await embedSettings.get());
    })
    .put('', async ({ embedSettings, request, user }) => {
      authorize(user, 'settings.manage');
      return json(await embedSettings.update(await readJson(request)));
    });
