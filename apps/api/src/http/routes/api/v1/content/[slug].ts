import { slugParams } from '../../../../params';
import { json } from '../../../../respond';
import type { ApiApp } from '../../../../services';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ publicContent, params }) =>
      json(await publicContent.getBySlug(params.slug)),
    slugParams,
  );
