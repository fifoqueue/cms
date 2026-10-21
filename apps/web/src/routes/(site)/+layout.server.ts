import { contentApi } from '#lib/server/api.js';
import { loadSlots } from '#lib/server/slots.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch, url }) => {
  const api = contentApi(fetch);
  const [site, pages, slots] = await Promise.all([
    api.site(),
    api.list({ type: 'page', pageSize: 20 }),
    loadSlots(api, { path: url.pathname }),
  ]);
  return {
    site,
    pages: pages.items.map(({ slug, title }) => ({ slug, title })),
    slots,
  };
};
