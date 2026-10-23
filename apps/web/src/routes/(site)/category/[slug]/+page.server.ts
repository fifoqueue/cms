import { loadTermArchive } from '#lib/server/archive.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, params, parent }) =>
  loadTermArchive(fetch, url, 'category', params.slug, parent());
