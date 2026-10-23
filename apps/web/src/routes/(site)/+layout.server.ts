import { loadThemeQueries } from '#lib/server/theme-queries.js';
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
import { sessionToken } from '#lib/server/session-cookie.js';
import { themePreviewToken } from '#lib/server/theme-preview.js';
import type { LayoutServerLoad } from './$types';

/**
 * Public pages only ever see published data from the content API. A signed-in visitor also
 * gets the toolbar (name and role only); such responses are never cached (hooks.server.ts).
 * Slots depend on the page, so each page loads its own; reading neither `url` nor `route` here
 * keeps client-side navigation (and link preloading) from re-running this load.
 */
export const load: LayoutServerLoad = async ({ fetch, cookies }) => {
  const api = contentApi(fetch);
  const token = sessionToken(cookies);
  const [layout, user] = await Promise.all([
    api.layout(themePreviewToken(cookies)),
    token
      ? authApi(fetch, token)
          .me()
          .catch(() => null)
      : null,
  ]);
  const { site, seo, theme, reading, menus, widgets } = layout;
  const { primary, footer } = menus;
  // Without a primary menu, navigation falls back to the published pages.
  const pages = primary ? null : await api.list({ type: 'page', pageSize: 20 });
  return {
    archives: layout.archives,
    queries: await loadThemeQueries(api, theme),
    site: siteView(site),
    seo: seoSettingsView(seo),
    theme: themeView(theme),
    reading: readingView(reading),
    menus: {
      primary: primary && menuView(primary),
      footer: footer && menuView(footer),
    },
    widgets: widgetsView(widgets),
    pages: pages?.items.map(pageLink) ?? [],
    toolbar: user && {
      name: user.name,
      role: user.role,
      capabilities: user.capabilities,
    },
  };
};
