import { t } from 'elysia';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ publicTaxonomy, params }) =>
      json(await publicTaxonomy.getBySlug(params.taxonomy, params.slug)),
    { params: t.Object({ taxonomy: t.String(), slug: t.String() }) },
  );
