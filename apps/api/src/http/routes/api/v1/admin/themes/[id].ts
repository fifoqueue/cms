import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage').delete(
    '',
    async ({ themes, params }) => {
      await themes.remove(params.id);

      return noContent();
    },
    idParams,
  );
