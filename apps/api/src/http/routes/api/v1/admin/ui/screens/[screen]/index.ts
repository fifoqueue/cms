import { adminScreenSchema, adminIdsSchema } from '@cms/sdk';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import { parseInput } from '#api/shared/validation';
import { t } from 'elysia';

export const routes = (app: ApiApp) =>
  session(app).get(
    '',
    async ({ adminUi, user, params, query }) => {
      const screen = parseInput(adminScreenSchema, params.screen);
      const ids = parseInput(
        adminIdsSchema,
        query.ids ? String(query.ids).split(',') : [],
      );

      return json(
        (await adminUi?.screen(user, screen, ids)) ?? {
          columns: [],
          values: {},
          rowActions: [],
          bulkActions: [],
          filters: [],
        },
      );
    },
    { params: t.Object({ screen: t.String() }) },
  );
