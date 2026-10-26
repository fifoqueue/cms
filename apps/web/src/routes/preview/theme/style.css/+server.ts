import { siteLayout } from '#lib/server/site-layout.js';
import { themeCss } from '#lib/server/theme-css.js';
import { themePreviewToken } from '#lib/server/theme-preview.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const { theme } = await siteLayout(event);
  const { body, hash } = themeCss(theme.css);
  const preview = theme.preview || themePreviewToken(event.cookies);
  return new Response(body, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': preview
        ? 'private, no-store'
        : event.url.searchParams.get('v') === hash
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      vary: 'Cookie',
    },
  });
};
