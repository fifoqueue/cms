import { idParams } from '#api/http/params';
import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Checks a protected entry's password and returns a proof the frontend keeps in a cookie. */
export const routes = (app: ApiApp) =>
  app.post(
    '',
    async ({ publicContent, clients, params, request }) =>
      json(
        await publicContent.unlock(
          params.id,
          await readJson(request, 16 * 1024),
          clients.attempt(request),
        ),
      ),
    idParams,
  );
