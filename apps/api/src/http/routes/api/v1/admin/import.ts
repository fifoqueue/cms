import { json } from '#api/http/respond';
import { readText } from '#api/http/request';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Imports a WordPress export file (WXR), sent as the request body. */
export const routes = (app: ApiApp) =>
  session(app).post(
    '',
    async ({ importer, request, user }) =>
      json(
        await importer.importWxr(
          await readText(request, 16 * 1024 * 1024),
          user,
        ),
      ),
    { parse: 'none' },
  );
