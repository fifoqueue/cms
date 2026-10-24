import { languageOf } from '#lib/i18n/index.js';
import { contentApi } from '#lib/server/api.js';
import type { LayoutServerLoad } from './$types';

/**
 * Sign-in pages speak the site's language. Before installation there is no site yet, so the
 * browser's preferred language is used. Only display data leaves this load.
 */
export const load: LayoutServerLoad = async ({ fetch, request, locals }) => {
  const api = contentApi(fetch);
  const fallbackLanguage =
    request.headers.get('accept-language')?.split(/[,;]/)[0]?.trim() || 'en';
  const [privacyPolicy, site] = await Promise.all([
    api
      .privacy()
      .then((privacy) => privacy.policy)
      .catch(() => null),
    api.site().catch(() => null),
  ]);
  const language = languageOf(site?.locale ?? fallbackLanguage);
  // `<html lang>` names the catalog language the screen is written in.
  locals.lang = language;
  return {
    privacyPolicy,
    language,
    loginPath: site?.loginPath ?? '/login',
    siteTitle: site?.title ?? null,
  };
};
