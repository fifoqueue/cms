import type { WritingSettingsInput } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [writing, categories] = await Promise.all([
    admin.writing.get(),
    admin.taxonomy.list('category'),
  ]);
  return {
    writing: {
      defaultCategoryId: writing.defaultCategoryId,
      defaultStatus: writing.defaultStatus,
    },
    categories: categories.map(({ id, name, parentId }) => ({
      id,
      name,
      parentId,
    })),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    try {
      // The API validates both choices.
      await adminFor(event).writing.update({
        defaultCategoryId: text(form, 'defaultCategoryId') || null,
        defaultStatus: text(
          form,
          'defaultStatus',
        ) as WritingSettingsInput['defaultStatus'],
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
