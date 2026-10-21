import { idParams } from '../../../../../../params';
import { json } from '../../../../../../respond';
import type { ApiApp } from '../../../../../../services';
import { session } from '../../../../../../session';

export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ plugins, params }) => json(await plugins.disable(params.id)),
    idParams,
  );
