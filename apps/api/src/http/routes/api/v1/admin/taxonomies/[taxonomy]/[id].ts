import { t } from 'elysia';
import { readJson } from '#api/http/request';
import { json, noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

const termParams = {
  params: t.Object({ taxonomy: t.String(), id: t.String() }),
};

export const routes = (app: ApiApp) =>
  session(app)
    .put(
      '',
      async ({ adminTaxonomy, params, request, user }) =>
        json(
          await adminTaxonomy.update(
            params.taxonomy,
            params.id,
            await readJson(request),
            user,
          ),
        ),
      termParams,
    )
    .delete(
      '',
      async ({ adminTaxonomy, params, user }) => {
        await adminTaxonomy.remove(params.taxonomy, params.id, user);

        return noContent();
      },
      termParams,
    );
