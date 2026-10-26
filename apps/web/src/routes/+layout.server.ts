import { siteLayout } from '#lib/server/site-layout.js';
import { themeView } from '#lib/server/public-view.js';
import { bodyFont } from '#lib/theme/style.js';
import type { LayoutServerLoad } from './$types';

/**
 * The site's body font for every screen (site, admin, sign-in, errors). Reading neither `url`
 * nor `route` keeps navigation from re-running it; without a site (setup, an outage) screens
 * keep their own font.
 */
export const load: LayoutServerLoad = async (event) => {
  const layout = await siteLayout(event).catch(() => null);
  const theme = layout ? themeView(layout.theme) : null;
  const site = layout?.site;
  return {
    uiFont: theme ? { family: bodyFont(theme), fonts: theme.fonts } : null,
    /** The site icon (Settings → General) for screens without site data: admin, sign-in, errors. */
    icon: site?.icon ? (site.icon.sizes[0]?.url ?? site.icon.url) : null,
  };
};
