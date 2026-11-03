import { loadSiteMessages } from '#lib/i18n/site.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => ({
  ...data,
  messages: await loadSiteMessages(data.siteCatalog),
});

// Content paths own their slash policy; the API redirects alternate spellings.
export const trailingSlash = 'ignore';
