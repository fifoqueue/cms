import {
  COLOR_MODE_COOKIE,
  COLOR_MODE_DEPENDENCY,
  colorModeOf,
} from '#lib/admin/color-mode.js';
import { loadAssets, loadNotices, screenName } from '#lib/server/admin-ui.js';
import type { LayoutServerLoad } from './$types';

/**
 * Also returns the registered notices and assets of the current admin screen. This load reads
 * `route`, so it re-runs per screen while the admin shell's own load does not; signed-out and
 * sign-in screens get none.
 */
export const load: LayoutServerLoad = async (event) => {
  const { cookies, depends, locals, request } = event;
  const route = event.route.id;

  depends(COLOR_MODE_DEPENDENCY);
  const screen =
    locals.user && route?.startsWith('/admin/(app)') ? screenName(route) : null;
  const [screenNotices, screenAssets] = screen
    ? await Promise.all([loadNotices(event, screen), loadAssets(event, screen)])
    : [[], []];

  locals.adminAssets = screenAssets;

  return {
    screenNotices,
    screenAssets,
    colorMode: colorModeOf(cookies.get(COLOR_MODE_COOKIE)),
    /** For admin error screens, which render above the layouts that load the site language. */
    language:
      locals.user?.locale ||
      request.headers.get('accept-language')?.split(/[,;]/)[0]?.trim() ||
      'en',
  };
};
