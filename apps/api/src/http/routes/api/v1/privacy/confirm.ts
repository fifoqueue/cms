import type { ApiApp } from '#api/http/services';
import { noContent } from '#api/http/respond';
import { readJson, SMALL_BODY_BYTES } from '#api/http/request';
export const routes = (app: ApiApp) =>
  app.post('', async ({ privacy, clients, request, set }) => {
    set.headers['cache-control'] = 'no-store';
    await privacy.confirm(
      await readJson(request, SMALL_BODY_BYTES),
      clients.attempt(request),
    );
    return noContent();
  });
