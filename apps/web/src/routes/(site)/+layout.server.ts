import { themeLinks } from '#lib/server/theme-links.js';
import { authApi, contentApi } from '#lib/server/api.js';
import { loadAdminBar } from '#lib/server/admin-ui.js';
import {
  menuView,
  pageLink,
  readingView,
  seoSettingsView,
  siteView,
  themeView,
  widgetsView,
} from '#lib/server/public-view.js';
import { siteLayout } from '#lib/server/site-layout.js';
import { themeCss } from '#lib/server/theme-css.js';
import { siteCatalog } from '#lib/i18n/site.server.js';
import { siteTranslation } from '#lib/i18n/overrides.server.js';
import type { LayoutServerLoad } from './$types';

/**
 * Public pages only ever see published data from the content API. A signed-in visitor also
 * gets the toolbar (name and role only); such responses are never cached (hooks.server.ts).
 * Slots depend on the page, so each page loads its own; reading neither `url` nor `route` here
 * keeps client-side navigation (and link preloading) from re-running this load.
 */
export const load: LayoutServerLoad = async ({ fetch, cookies, locals }) => {
  const api = contentApi(fetch);
  // The hook chooses the scheme-specific cookie without making this layout depend on `url`.
  const token = locals.token;
  const [layout, user, barItems] = await Promise.all([
    siteLayout({ fetch, cookies, locals }),
    token
      ? authApi(fetch, token)
          .me()
          .catch(() => null)
      : null,
    token ? loadAdminBar({ fetch, locals }) : [],
  ]);
  const { site, seo, reading, menus, widgets } = layout;
  const theme = themeView(layout.theme);
  const { primary, footer } = menus;

  locals.lang = site.locale;
  const [pages, linkRoutes, translation] = await Promise.all([
    // Without a primary menu, navigation falls back to the published pages.
    primary ? null : api.list({ type: 'page', pageSize: 20 }),
    themeLinks(layout.theme),
    siteTranslation(fetch, site.locale),
  ]);

  // Copy and `<html lang>` follow the locale the API chose for the site.
  locals.lang = translation.locale;

  return {
    siteCatalog: siteCatalog(translation.locale, translation.messages),
    /** The language tag pages are shown in: the site locale unless the API chose another. */
    displayLocale: translation.locale,
    linkRoutes,
    privacy: layout.privacy,
    archives: layout.archives,
    site: siteView(site),
    seo: seoSettingsView(seo),
    cssHash: themeCss(theme.css).hash,
    theme: {
      id: theme.id,
      name: theme.name,
      settings: theme.settings,
      styles: theme.styles,
      fonts: theme.fonts,
      preview: theme.preview,
    },
    reading: readingView(reading),
    menus: {
      primary: primary && menuView(primary),
      footer: footer && menuView(footer),
    },
    widgets: widgetsView(widgets),
    pages: pages?.items.map(pageLink) ?? [],
    toolbar: user && {
      name: user.name,
      slug: user.slug,
      role: user.role,
      capabilities: user.capabilities,
      items: barItems,
    },
  };
};
