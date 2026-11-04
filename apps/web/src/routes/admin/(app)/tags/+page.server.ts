import {
  loadTerms,
  removeTerm,
  saveTerm,
  termExtensionAction,
} from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadTerms(event, 'tag');

export const actions: Actions = {
  extension: termExtensionAction,
  create: (event) => saveTerm(event, 'tag', 'create'),
  update: (event) => saveTerm(event, 'tag', 'update'),
  delete: (event) => removeTerm(event, 'tag'),
};
