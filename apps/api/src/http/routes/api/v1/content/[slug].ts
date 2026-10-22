import { slugParams } from '#api/http/params';
import { unlockProofs } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ publicContent, params, request }) =>
      json(await publicContent.getBySlug(params.slug, unlockProofs(request))),
    slugParams,
  );
