import { idParams } from '../../../../../params';
import { noContent } from '../../../../../respond';
import type { ApiApp } from '../../../../../services';
import { session } from '../../../../../session';

export const routes = (app: ApiApp) =>
  session(app).delete(
    '',
    async ({ plugins, params }) => {
      await plugins.remove(params.id);

      return noContent();
    },
    idParams,
  );
