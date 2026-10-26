import { loadErrorData } from '#lib/server/theme-queries.js';
import { themeLinks } from '#lib/server/theme-links.js';
import { authApi, contentApi } from '#lib/server/api.js';
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
  const [layout, user] = await Promise.all([
    siteLayout({ fetch, cookies, locals }),
    token
      ? authApi(fetch, token)
          .me()
          .catch(() => null)
      : null,
  ]);
  const { site, seo, reading, menus, widgets } = layout;
  const theme = themeView(layout.theme);
  const { primary, footer } = menus;
  locals.lang = site.locale;
  const [pages, blocks, linkRoutes] = await Promise.all([
    // Without a primary menu, navigation falls back to the published pages.
    primary ? null : api.list({ type: 'page', pageSize: 20 }),
    // Errors have no load: both templates share their data, fetched in parallel.
    loadErrorData(api, theme, reading.timeZone),
    themeLinks(layout.theme),
  ]);
  return {
    linkRoutes,
    privacy: layout.privacy,
    archives: layout.archives,
    ...blocks,
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
    },
  };
};
