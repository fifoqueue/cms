import type { MenusSettingsInput } from '@cms/sdk';
import { failFrom, jsonField } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [menus, pages, posts, categories, tags, model] = await Promise.all([
    admin.menus.get(),
    admin.content.list({ type: 'page', status: 'published', pageSize: 100 }),
    admin.content.list({ type: 'post', status: 'published', pageSize: 50 }),
    admin.taxonomy.list('category'),
    admin.taxonomy.list('tag'),
    admin.contentModel.model(),
  ]);
  const option = ({ id, title }: { id: string; title: string }) => ({
    id,
    title,
  });
  const term = ({ id, name }: { id: string; name: string }) => ({ id, name });
  return {
    menus,
    content: [...pages.items.map(option), ...posts.items.map(option)],
    categories: categories.map(term),
    tags: tags.map(term),
    archives: model.types
      .filter((type) => type.archive)
      .map(({ key, pluralName }) => ({ key, name: pluralName })),
  };
};

export const actions: Actions = {
  /** The editor sends every menu and location as one JSON document; the API validates it. */
  save: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).menus.update(
        jsonField(form, 'menus') as MenusSettingsInput,
      );
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
