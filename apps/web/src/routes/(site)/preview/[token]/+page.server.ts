import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import { contentView } from '#lib/server/public-view.js';
import { emptySlots } from '#lib/server/slots.js';
import type { PageServerLoad } from './$types';

/** Unpublished changes rendered by the theme. Never cached or indexed. */
export const load: PageServerLoad = async ({ fetch, params, setHeaders }) => {
  setHeaders({
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
  });
  const content = await contentApi(fetch)
    .preview(params.token)
    .catch(notFoundFrom);
  return {
    kind: 'preview' as const,
    content: contentView(content),
    slots: emptySlots(),
  };
};
