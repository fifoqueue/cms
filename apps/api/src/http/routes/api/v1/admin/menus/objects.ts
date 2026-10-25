import { session } from '#api/http/session';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { menuObjectQuerySchema } from '@cms/sdk';
import { providerKeySchema } from '@cms/sdk/plugin';
import { parseInput } from '#api/shared/validation';

export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage').get('', async ({ menus, user, query }) =>
    json(
      await menus.objects(
        parseInput(providerKeySchema, query.type),
        parseInput(menuObjectQuerySchema, query),
        user,
      ),
    ),
  );
