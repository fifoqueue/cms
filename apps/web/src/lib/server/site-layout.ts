import type { Cookies } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { themePreviewToken } from '#lib/server/theme-preview.js';

/** Share the validated layout only within this request; never serialize the cache. */
export const siteLayout = (event: {
  fetch: typeof fetch;
  cookies: Cookies;
  locals: App.Locals;
}) =>
  (event.locals.siteLayout ??= contentApi(event.fetch).layout(
    themePreviewToken(event.cookies),
  ));
