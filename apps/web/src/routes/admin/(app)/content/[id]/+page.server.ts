import { redirect } from '@sveltejs/kit';
import { readContentForm } from '#lib/server/content-form.js';
import { failFrom, notFoundFrom } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  entry: await adminFor(event).content.get(event.params.id).catch(notFoundFrom),
});

export const actions: Actions = {
  save: async (event) => {
    const { input, failure } = readContentForm(await event.request.formData());
    if (failure) return failure;
    try {
      await adminFor(event).content.update(event.params.id, input);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'Saved' };
  },
  delete: async (event) => {
    try {
      await adminFor(event).content.remove(event.params.id);
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, '/admin/content');
  },
};
