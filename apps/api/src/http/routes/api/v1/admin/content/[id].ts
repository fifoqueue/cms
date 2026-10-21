import { idParams } from '../../../../../params';
import { readJson } from '../../../../../request';
import { json, noContent } from '../../../../../respond';
import type { ApiApp } from '../../../../../services';
import { session } from '../../../../../session';

export const routes = (app: ApiApp) =>
  session(app)
    .get(
      '',
      async ({ adminContent, params }) =>
        json(await adminContent.get(params.id)),
      idParams,
    )
    .put(
      '',
      async ({ adminContent, params, request }) =>
        json(await adminContent.update(params.id, await readJson(request))),
      idParams,
    )
    .delete(
      '',
      async ({ adminContent, params }) => {
        await adminContent.remove(params.id);

        return noContent();
      },
      idParams,
    );
