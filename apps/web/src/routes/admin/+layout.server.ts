import {
  COLOR_MODE_COOKIE,
  COLOR_MODE_DEPENDENCY,
  colorModeOf,
} from '#lib/admin/color-mode.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({
  cookies,
  depends,
  locals,
  request,
}) => {
  depends(COLOR_MODE_DEPENDENCY);
  return {
    colorMode: colorModeOf(cookies.get(COLOR_MODE_COOKIE)),
    /** For admin error screens, which render above the layouts that load the site language. */
    language:
      locals.user?.locale ||
      request.headers.get('accept-language')?.split(/[,;]/)[0]?.trim() ||
      'en',
  };
};
