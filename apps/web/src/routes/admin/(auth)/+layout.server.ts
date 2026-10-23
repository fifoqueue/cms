import { contentApi } from '#lib/server/api.js';
import type { LayoutServerLoad } from './$types';

/**
 * Sign-in pages speak the site's language. Before installation there is no site yet, so the
 * browser's preferred language is used.
 */
export const load: LayoutServerLoad = async ({ fetch, request }) => ({
  privacyPolicy: await contentApi(fetch)
    .privacy()
    .then((privacy) => privacy.policy)
    .catch(() => null),
  language: await contentApi(fetch)
    .site()
    .then((site) => site.locale)
    .catch(
      () =>
        request.headers.get('accept-language')?.split(/[,;]/)[0]?.trim() ||
        'en',
    ),
});
