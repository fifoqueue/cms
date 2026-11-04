import { t } from 'elysia';
import { authorize } from '#api/domain/auth/authorization';
import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { adminTermListQuerySchema } from '@cms/sdk';
import { parseInput } from '#api/shared/validation';

const taxonomyParams = { params: t.Object({ taxonomy: t.String() }) };

export const routes = (app: ApiApp) =>
  // Every writer reads the terms to assign them; changing terms needs `taxonomy.manage`.
  session(app, 'content.create')
    .get(
      '',
      async ({ adminTaxonomy, adminUi, user, params, query: input }) =>
        json(
          await adminTaxonomy.list(params.taxonomy, async (query) => {
            const values = { ...query, ...input, taxonomy: query.taxonomy };

            return parseInput(
              adminTermListQuerySchema,
              adminUi
                ? await adminUi.apply(
                    user,
                    'terms',
                    values,
                    adminTermListQuerySchema,
                  )
                : values,
            );
          }),
        ),
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
