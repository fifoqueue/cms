import { slugParams } from '#api/http/params';
import { CONTENT_UNLOCK_HEADER } from '@cms/sdk';
import { unlockProofs } from '#api/http/request';
import { json, privateJson } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ publicContent, params, request, set }) => {
      const proofs = unlockProofs(request);

      set.headers.vary = CONTENT_UNLOCK_HEADER;
      const content = await publicContent.getBySlug(params.slug, proofs);

      return proofs.length ? privateJson(content) : json(content);
    },
    slugParams,
  );
