import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.post(
    '',
    async ({ ssoLogout, request }) => {
      await ssoLogout.logout(await readJson(request, SMALL_BODY_BYTES));

      return noContent();
    },
    { parse: 'none' },
  );
