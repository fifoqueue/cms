import { contentApi } from '#lib/server/api.js';
import { themeView } from '#lib/server/public-view.js';
import { bodyFont } from '#lib/theme/style.js';
import type { LayoutServerLoad } from './$types';

/**
 * The site's body font for every screen (site, admin, sign-in, errors). Reading neither `url`
 * nor `route` keeps navigation from re-running it; without a site (setup, an outage) screens
 * keep their own font.
 */
export const load: LayoutServerLoad = async ({ fetch }) => {
  const theme = await contentApi(fetch)
    .layout()
    .then((layout) => themeView(layout.theme))
    .catch(() => null);
  return {
    uiFont: theme ? { family: bodyFont(theme), fonts: theme.fonts } : null,
  };
};
