import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get('', async ({ contentTypes, fields }) =>
    json(await contentTypes.publicList(await fields.list())),
  );
