import { loadTermArchive } from '#lib/server/archive.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) =>
  loadTermArchive(event, 'tag', event.params.slug, event.parent());
