import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
import { noContent } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Sets a password from an emailed reset or invitation link. */
export const routes = (app: ApiApp) =>
  app.post('', async ({ passwords, request }) => {
    await passwords.reset(await readJson(request, SMALL_BODY_BYTES));
    return noContent();
  });
