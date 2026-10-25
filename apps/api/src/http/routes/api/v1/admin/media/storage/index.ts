import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { readJson } from '#api/http/request';
import { authorize } from '#api/domain/auth/authorization';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ media, user }) => {
      authorize(user, 'settings.manage');
      return json(await media.storageSettings.get());
    })
    .put(
      '',
      async ({ media, user, request }) => {
        authorize(user, 'settings.manage');
        return json(
          await media.storageSettings.update(await readJson(request)),
        );
      },
      { parse: 'none' },
    );
