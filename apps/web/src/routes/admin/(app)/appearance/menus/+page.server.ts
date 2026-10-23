import type { MenuItem, MenusSettingsInput } from '@cms/sdk';
import { failFrom, jsonField, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [menus, latest, categories, tags, model] = await Promise.all([
    admin.menus.get(),
    // The most recent entries; older ones are found with the search (`?/find`).
    admin.content.list({ status: 'published', pageSize: 20 }),
    admin.taxonomy.list('category'),
    admin.taxonomy.list('tag'),
    admin.contentModel.model(),
  ]);
  const option = ({ id, title }: { id: string; title: string }) => ({
    id,
    title,
  });
  const term = ({ id, name }: { id: string; name: string }) => ({ id, name });
  // Titles of linked entries outside the recent list; unpublished ones stay unnamed.
  const listed = new Set(latest.items.map(({ id }) => id));
  const linked = new Set<string>();
  const collect = (items: MenuItem[]) => {
    for (const item of items) {
      if (item.contentId && !listed.has(item.contentId))
        linked.add(item.contentId);
      collect(item.children);
    }
  };
  for (const menu of menus.menus) collect(menu.items);
  // shortcut: one read per linked entry, fine for hand-built menus; add a by-ids list if menus grow large.
  const titles = (
    await Promise.all(
      [...linked].map((id) =>
        admin.content.get(id).then(
          (entry) =>
            entry.status === 'published' && !entry.trashedAt
              ? option(entry)
              : null,
          () => null,
        ),
      ),
    )
  ).filter((entry) => entry !== null);
  return {
    menus,
    content: latest.items.map(option),
    titles,
    categories: categories.map(term),
    tags: tags.map(term),
    archives: model.types
      .filter((type) => type.archive)
      .map(({ key, pluralName }) => ({ key, name: pluralName })),
  };
};

export const actions: Actions = {
  /** Published entries matching the search, for the content picker. */
  find: async (event) => {
    const search = text(await event.request.formData(), 'q')
      .trim()
      .slice(0, 200);
    const found = await adminFor(event).content.list({
      status: 'published',
      search: search || undefined,
      pageSize: 50,
    });
    return {
      found: found.items.map(({ id, title, type }) => ({ id, title, type })),
    };
  },
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
