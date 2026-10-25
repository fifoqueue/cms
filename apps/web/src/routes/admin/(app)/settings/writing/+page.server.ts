import type { WritingSettingsInput } from '@cms/sdk';
import { text } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [writing, categories, model] = await Promise.all([
    admin.writing.get(),
    admin.taxonomy.list('category'),
    admin.contentModel.model(),
  ]);
  return {
    writing: {
      defaultCategoryId: writing.defaultCategoryId,
      defaultStatus: writing.defaultStatus,
      autoToc: writing.autoToc,
    },
    types: model.types.map(({ key, pluralName }) => ({ key, pluralName })),
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
    // The API validates both choices.
    return submitAction(() =>
      adminFor(event).writing.update({
        autoToc: {
          enabled: form.has('tocEnabled'),
          types: form.getAll('tocTypes').map(String),
          position: text(form, 'tocPosition') as 'top' | 'beforeFirstHeading',
          title: text(form, 'tocTitle'),
          levels: form.getAll('tocLevels').map(Number),
          minHeadings: Number(text(form, 'tocMinimum')),
          collapsible: form.has('tocCollapsible'),
          open: form.has('tocOpen'),
        },
        defaultCategoryId: text(form, 'defaultCategoryId') || null,
        defaultStatus: text(
          form,
          'defaultStatus',
        ) as WritingSettingsInput['defaultStatus'],
      }),
    );
  },
};
