import type { MenusSettingsInput } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import { failFrom, jsonField, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import { mapLimit } from '#lib/server/bounded.js';
import type { Actions, PageServerLoad } from './$types';

// Choices come from the public, published-only API, so `appearance.manage` alone is enough.
export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const site = contentApi(event.fetch);
  const [
    menus,
    targets,
    latest,
    categories,
    tags,
    types,
    itemTypes,
    definitions,
  ] = await Promise.all([
    admin.menus.get(),
    // Titles of the entries the saved menus link to; unpublished ones stay unnamed.
    admin.menus.targets(),
    // The most recent entries; older ones are found with the search (`?/find`).
    site.list({ pageSize: 20 }),
    site.taxonomy.list('category'),
    site.taxonomy.list('tag'),
    site.contentTypes(),
    // Item types plugins register; a failure only hides them.
    admin.menus.types().catch(() => []),
    admin.taxonomyTypes.list().catch(() => []),
  ]);
  const option = ({ id, title }: { id: string; title: string }) => ({
    id,
    title,
  });
  const term = ({ id, name }: { id: string; name: string }) => ({ id, name });
  // Custom and plugin taxonomies, each with its public terms.
  const taxonomies = await mapLimit(
    definitions.filter(({ key }) => key !== 'category' && key !== 'tag'),
    async ({ key, name }) => ({
      key,
      name,
      terms: (await site.taxonomy.list(key).catch(() => [])).map(term),
    }),
  );
  return {
    menus,
    itemTypes: itemTypes.map(({ key, label, source, searchable }) => ({
      key,
      label,
      source,
      searchable,
    })),
    taxonomies,
    content: latest.items.map(option),
    titles: targets.map(option),
    categories: categories.map(term),
    tags: tags.map(term),
    archives: types
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
    const found = await contentApi(event.fetch).list({
      search: search || undefined,
      pageSize: 50,
    });
    return {
      found: found.items.map(({ id, title, type }) => ({ id, title, type })),
    };
  },
  /** Objects of a plugin menu item type, for its picker (searched when the type allows). */
  objects: async (event) => {
    const form = await event.request.formData();
    const search = text(form, 'q').trim().slice(0, 200);
    try {
      const found = await adminFor(event).menus.objects(text(form, 'type'), {
        search: search || undefined,
        pageSize: 50,
      });
      return {
        objects: found.items.map(({ id, label }) => ({ id, label })),
      };
    } catch (caught) {
      return failFrom(caught);
    }
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
