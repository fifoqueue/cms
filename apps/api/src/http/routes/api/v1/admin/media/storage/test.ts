import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { readJson } from '#api/http/request';
import { authorize } from '#api/domain/auth/authorization';

export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ media, user, request }) => {
      authorize(user, 'settings.manage');
      await media.storageSettings.test(await readJson(request));
      return new Response(null, { status: 204 });
    },
    { parse: 'none' },
  );
