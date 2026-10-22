import { loadTermArchive } from '#lib/server/archive.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, params, parent }) =>
  loadTermArchive(
    fetch,
    url,
    params.taxonomy,
    params.slug,
    (await parent()).reading.postsPerPage,
  );
