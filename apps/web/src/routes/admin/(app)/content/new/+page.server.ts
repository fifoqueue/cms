import { redirect } from '@sveltejs/kit';
import { readContentForm } from '#lib/server/content-form.js';
import { failFrom } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions } from './$types';

export const actions: Actions = {
  save: async (event) => {
    const { input, failure } = readContentForm(await event.request.formData());
    if (failure) return failure;
    let id: string;
    try {
      ({ id } = await adminFor(event).content.create(input));
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, `/admin/content/${id}`);
  },
};
