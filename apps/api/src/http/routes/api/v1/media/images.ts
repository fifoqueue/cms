import { readJson } from '#api/http/request';
import { json } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

/** Metadata of already-public image URLs, without library or uploader information. */
export const routes = (app: ApiApp) =>
  app.post(
    '',
    async ({ media, request }) =>
      json(await media.publicImages(await readJson(request))),
    { parse: 'none' },
  );
