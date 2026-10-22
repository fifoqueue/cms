import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ adminContent, params, user }) => {
      await adminContent.restore(params.id, user);
      return noContent();
    },
    idParams,
  );
