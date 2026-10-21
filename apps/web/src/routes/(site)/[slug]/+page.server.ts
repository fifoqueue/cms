import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import { loadSlots } from '#lib/server/slots.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, params, url }) => {
  const api = contentApi(fetch);
  const content = await api.getBySlug(params.slug).catch(notFoundFrom);
  return {
    content,
    slots: await loadSlots(api, { path: url.pathname, contentId: content.id }),
  };
};
