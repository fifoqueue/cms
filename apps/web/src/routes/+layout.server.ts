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
  const api = contentApi(fetch);
  const [theme, site] = await Promise.all([
    api
      .layout()
      .then((layout) => themeView(layout.theme))
      .catch(() => null),
    api.site().catch(() => null),
  ]);
  return {
    uiFont: theme ? { family: bodyFont(theme), fonts: theme.fonts } : null,
    /** The site icon (Settings → General) for screens without site data: admin, sign-in, errors. */
    icon: site?.icon ? (site.icon.sizes[0]?.url ?? site.icon.url) : null,
  };
};
