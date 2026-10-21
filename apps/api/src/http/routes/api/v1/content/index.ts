import { json } from '../../../../respond';
import type { ApiApp } from '../../../../services';

export const routes = (app: ApiApp) =>
  app.get('', async ({ publicContent, query }) =>
    json(await publicContent.list(query)),
  );
