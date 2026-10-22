import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).delete(
    '',
    async ({ apiTokens, params, user }) => {
      await apiTokens.revoke(params.id, user);
      return noContent();
    },
    idParams,
  );
