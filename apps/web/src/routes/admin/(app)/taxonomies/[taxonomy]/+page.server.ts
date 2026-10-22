import { adminFor } from '#lib/server/session.js';
import { loadTerms, removeTerm, saveTerm } from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  ...(await loadTerms(event, event.params.taxonomy)),
  definition: (await adminFor(event).taxonomyTypes.list()).find(
    (type) => type.key === event.params.taxonomy,
  ),
});

export const actions: Actions = {
  create: (event) => saveTerm(event, event.params.taxonomy, 'create'),
  update: (event) => saveTerm(event, event.params.taxonomy, 'update'),
  delete: (event) => removeTerm(event, event.params.taxonomy),
};
