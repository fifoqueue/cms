import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';
import { userQuerySchema } from '@cms/sdk';
import { parseInput } from '#api/shared/validation';

export const routes = (app: ApiApp) =>
  session(app)
    .get('', async ({ users, user, adminUi, query }) =>
      json(
        await users.list(
          user,
          adminUi
            ? await adminUi.apply(user, 'users', query, userQuerySchema)
            : parseInput(userQuerySchema, query),
        ),
      ),
    )
    .post('', async ({ users, request, user }) =>
      json(await users.create(await readJson(request), user), 201),
    );
