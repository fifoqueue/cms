import { loadTemplateData } from '#lib/server/theme-queries.js';
import { authApi, contentApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';
import {
  menuView,
  pageLink,
  readingView,
  seoSettingsView,
  siteView,
  themeView,
  widgetsView,
} from '#lib/server/public-view.js';
import { SESSION_COOKIE } from '#lib/server/session-cookie.js';
import { themePreviewToken } from '#lib/server/theme-preview.js';
import type { LayoutServerLoad } from './$types';

/**
 * Public pages only ever see published data from the content API. A signed-in visitor also
 * gets the toolbar (name and role only); such responses are never cached (hooks.server.ts).
 * Slots depend on the page, so each page loads its own; reading neither `url` nor `route` here
 * keeps client-side navigation (and link preloading) from re-running this load.
 */
export const load: LayoutServerLoad = async ({ fetch, cookies, locals }) => {
  const api = contentApi(fetch);
  // Public layouts do not read `url`; HTTP development still authenticates page actions/routes.
  const token = cookies.get(SESSION_COOKIE) ?? null;
  const [layout, user] = await Promise.all([
    api.layout(themePreviewToken(cookies)),
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
  const [pages, blocks] = await Promise.all([
    // Without a primary menu, navigation falls back to the published pages.
    primary ? null : api.list({ type: 'page', pageSize: 20 }),
    // Pages load the data of their own template; error pages only have this one.
    loadTemplateData(
      api,
      { theme },
      {
        kind: 'error',
        status: 404,
        message: Errors.NotFound,
      },
    ),
  ]);
  return {
    archives: layout.archives,
    ...blocks,
    site: siteView(site),
    seo: seoSettingsView(seo),
    theme,
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
