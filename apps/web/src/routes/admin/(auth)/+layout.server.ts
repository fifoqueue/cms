import { contentApi } from '#lib/server/api.js';
import type { LayoutServerLoad } from './$types';

/**
 * Sign-in pages speak the site's language. Before installation there is no site yet, so the
 * browser's preferred language is used.
 */
export const load: LayoutServerLoad = async ({ fetch, request }) => {
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
  return {
    privacyPolicy,
    language: site?.locale ?? fallbackLanguage,
    loginPath: site?.loginPath ?? '/login',
  };
};
