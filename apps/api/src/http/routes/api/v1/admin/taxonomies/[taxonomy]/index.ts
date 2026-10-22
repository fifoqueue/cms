import { t } from 'elysia';
import { authorize } from '#api/domain/auth/authorization';
import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

const taxonomyParams = { params: t.Object({ taxonomy: t.String() }) };

export const routes = (app: ApiApp) =>
  // Every writer reads the terms to assign them; changing terms needs `taxonomy.manage`.
  session(app, 'content.create')
    .get(
      '',
      async ({ adminTaxonomy, params }) =>
        json(await adminTaxonomy.list(params.taxonomy)),
      taxonomyParams,
    )
    .post(
      '',
      async ({ adminTaxonomy, params, request, user }) => {
        authorize(user, 'taxonomy.manage');
        return json(
          await adminTaxonomy.create(params.taxonomy, await readJson(request)),
          201,
        );
      },
      taxonomyParams,
    );
