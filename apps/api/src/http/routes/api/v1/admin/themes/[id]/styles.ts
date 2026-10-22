import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import { readJson } from '#api/http/request';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage')
    .put(
      '',
      async ({ themes, params, request }) => {
        await themes.saveStyles(params.id, await readJson(request));
        return noContent();
      },
      idParams,
    )
    .delete(
      '',
      async ({ themes, params }) => {
        await themes.resetStyles(params.id);
        return noContent();
      },
      idParams,
    );
