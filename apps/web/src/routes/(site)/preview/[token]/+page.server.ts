import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import { contentView } from '#lib/server/public-view.js';
import { emptySlots } from '#lib/server/slots.js';
import { withTemplateData } from '#lib/server/theme-queries.js';
import type { PageServerLoad } from './$types';

/** Unpublished changes rendered by the theme. Never cached or indexed. */
export const load: PageServerLoad = async ({
  fetch,
  params,
  setHeaders,
  parent,
}) => {
  setHeaders({
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
  });
  const api = contentApi(fetch);
  const content = await api.preview(params.token).catch(notFoundFrom);
  return withTemplateData(api, parent, {
    kind: 'preview' as const,
    content: contentView(content),
    slots: emptySlots(),
  });
};
