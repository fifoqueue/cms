import { idParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage').post(
    '',
    async ({ themes, params }) => json(await themes.activate(params.id)),
    idParams,
  );
