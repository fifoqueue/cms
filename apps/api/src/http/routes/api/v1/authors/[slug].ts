import { slugParams } from '#api/http/params';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ users, params }) => json(await users.publicAuthor(params.slug)),
    slugParams,
  );
