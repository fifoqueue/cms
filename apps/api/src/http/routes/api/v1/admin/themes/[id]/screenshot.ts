import { idParams } from '#api/http/params';
import type { ApiApp } from '#api/http/services';
import { session } from '#api/http/session';

/** The theme's preview image; 404 when it has none. */
export const routes = (app: ApiApp) =>
  session(app, 'appearance.manage').get(
    '',
    async ({ themes, params }) => {
      const image = await themes.screenshot(params.id);
      if (!image) return new Response(null, { status: 404 });
      return new Response(image.bytes, {
        headers: {
          'content-type': image.type,
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'",
          'cache-control': 'private, max-age=300',
        },
      });
    },
    idParams,
  );
