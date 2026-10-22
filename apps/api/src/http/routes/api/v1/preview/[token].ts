import { tokenParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** An entry as the site would show it with unpublished changes. Never cached. */
export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ previews, params }) => {
      const response = json(await previews.render(params.token));
      response.headers.set('cache-control', 'no-store');
      return response;
    },
    tokenParams,
  );
