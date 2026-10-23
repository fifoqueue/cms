import { errorResponse } from '#api/http/respond';
import { idParams } from '#api/http/params';
import type { ApiApp } from '#api/http/services';
import { Errors } from '#api/shared/errors';

export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ avatars, comments, params, request }) => {
      const requested = Number(new URL(request.url).searchParams.get('s'));
      const image = await avatars.image(
        params.id,
        Number.isFinite(requested) ? requested : 96,
        await comments.discussion(),
      );
      if (!image) return errorResponse(404, 'not_found', Errors.AvatarNotFound);
      return new Response(image.bytes.slice().buffer as ArrayBuffer, {
        headers: {
          'content-type': image.contentType,
          'content-length': String(image.bytes.length),
          'cache-control':
            'public, max-age=86400, stale-while-revalidate=604800',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
        },
      });
    },
    idParams,
  );
