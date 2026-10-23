import { failFrom, text } from '#lib/server/errors.js';
import { permalinkView, readPermalinkForm } from '#lib/server/seo-admin.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/** Settings → Permalinks: address patterns per content type and the category/tag bases. */
export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [permalinks, archives, model] = await Promise.all([
    admin.permalinks.settings(),
    admin.archivePaths.get(),
    admin.contentModel.model(),
  ]);
  return {
    archives,
    permalinks: permalinkView(permalinks),
    types: model.types.map(({ key, pluralName }) => ({ key, pluralName })),
  };
};

export const actions: Actions = {
  archives: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).archivePaths.update({
        category: text(form, 'category'),
        tag: text(form, 'tag'),
      });
    } catch (caught) {
      return failFrom(caught, { intent: 'archives' as const });
    }
    return { notice: 'saved', intent: 'archives' as const };
  },
  permalinks: async (event) => {
    const [form, model] = await Promise.all([
      event.request.formData(),
      adminFor(event).contentModel.model(),
    ]);
    const { values, input, failure } = readPermalinkForm(
      form,
      model.types.map((type) => type.key),
    );
    if (failure) return failure;
    try {
      await adminFor(event).permalinks.update(input);
    } catch (caught) {
      // Collisions with existing addresses come back as field issues; nothing was changed.
      return failFrom(caught, {
        intent: 'permalinks' as const,
        permalinks: values,
      });
    }
    return { intent: 'permalinks' as const, notice: 'saved' };
  },
};
