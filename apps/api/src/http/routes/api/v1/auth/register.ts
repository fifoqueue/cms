import { json, noContent } from '#api/http/respond';
import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import type { ApiApp } from '#api/http/services';
import { obscureAccountLookup } from '#api/http/account-response';

export const routes = (app: ApiApp) =>
  app
    .get('', async ({ users }) => json(await users.membership()))
    .post('', async ({ users, request, clients }) =>
      obscureAccountLookup(async () => {
        await users.register(
          await readJson(request, SMALL_BODY_BYTES),
          clients.attempt(request),
        );
        return noContent();
      }),
    );
