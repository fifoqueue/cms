import { idParams } from '#api/http/params';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** Explicit, authenticated generation; public file reads never trigger expensive transforms. */
export const routes = (app: ApiApp) =>
  session(app, 'media.upload').post(
    '',
    async ({ media, params, request, user }) => {
      const name = new URL(request.url).searchParams.get('name') ?? '';
      const image = await media.derivative(params.id, name, user);
      return new Response(new Blob([image.bytes.slice()]), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
    idParams,
  );
