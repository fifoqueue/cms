import {
  loadTerms,
  removeTerm,
  saveTerm,
  termExtensionAction,
} from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadTerms(event, 'category');

export const actions: Actions = {
  extension: termExtensionAction,
  create: (event) => saveTerm(event, 'category', 'create'),
  update: (event) => saveTerm(event, 'category', 'update'),
  delete: (event) => removeTerm(event, 'category'),
};
