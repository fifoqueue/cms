import { json, noContent } from '#api/http/respond';
import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app
    .get('', async ({ users }) => json(await users.membership()))
    .post('', async ({ users, request, clients }) => {
      await users.register(
        await readJson(request, SMALL_BODY_BYTES),
        clients.attempt(request),
      );
      return noContent();
    });
