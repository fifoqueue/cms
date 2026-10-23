import { CONTENT_STATUSES, can, contentListQuerySchema } from '@cms/sdk';
import type { ContentStatus } from '@cms/sdk';
import { fail } from '@sveltejs/kit';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { readQuickEdit } from '#lib/server/quick-edit.js';
import { adminFor } from '#lib/server/session.js';
import { loadTaxonomyChoices } from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

const pick = <T extends string>(options: readonly T[], value: string | null) =>
  options.find((option) => option === value);

/** Bulk actions in the order they appear in the menu. */
const BULK = ['trash', 'restore', 'delete'] as const;

export const load: PageServerLoad = async (event) => {
  const params = event.url.searchParams;
  const admin = adminFor(event);
  const [model, terms, authors] = await Promise.all([
    admin.contentModel.model(),
    loadTaxonomyChoices(event),
    can(event.locals.user!, 'content.editOthers')
      ? admin.users.authors()
      : null,
  ]);
  const type = pick(
    model.types.map(({ key }) => key),
    params.get('type'),
  );
  const status = pick<ContentStatus>(CONTENT_STATUSES, params.get('status'));
  const view = params.get('view') === 'trash' ? 'trash' : 'active';
  // Only slugs of existing terms are sent; anything else means "no filter".
  const category = pick(
    terms.categories.map(({ slug }) => slug),
    params.get('category'),
  );
  const tag = pick(
    terms.tags.map(({ slug }) => slug),
    params.get('tag'),
  );
  const definition = terms.extraTaxonomies.find(
    (entry) => entry.key === params.get('taxonomy'),
  );
  const term = pick(
    definition?.terms.map(({ slug }) => slug) ?? [],
    params.get('term'),
  );
  const taxonomy = term ? definition?.key : undefined;
  const search = (params.get('q') ?? '').trim().slice(0, 200) || undefined;
  const author = pick(
    authors?.map(({ slug }) => slug) ?? [],
    params.get('author'),
  );
  // `YYYY-MM`, as the month input sends it; entries are dated by publication in the site time zone.
  // Anything the API's list query would reject means "no filter", like the other filters.
  const [, year, month] = /^(\d{4})-(\d{2})$/.exec(params.get('m') ?? '') ?? [];
  const parsed =
    year && contentListQuerySchema.safeParse({ year, month }).success;
  const dated = parsed ? { year: Number(year), month: Number(month) } : null;
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  // Status view totals follow the type only, like wp-admin.
  const [content, counts] = await Promise.all([
    admin.content.list({
      type,
      orderBy: type === 'page' ? 'menuOrder' : 'updatedAt',
      order: type === 'page' ? 'asc' : 'desc',
      status,
      view,
      category,
      tag,
      taxonomy,
      term,
      author,
      year: dated?.year,
      month: dated?.month,
      search,
      page,
      pageSize: 20,
    }),
    admin.content.counts(type),
  ]);
  return {
    filter: {
      type,
      status,
      view,
      category,
      tag,
      taxonomy,
      term,
      author,
      m: dated ? `${year}-${month}` : undefined,
      q: search,
    },
    counts,
    types: model.types.map(({ key, name, pluralName, builtin, supports }) => ({
      key,
      name,
      pluralName,
      builtin,
      categories: supports.categories,
      tags: supports.tags,
    })),
    ...terms,
    authors,
    canPublish: can(event.locals.user!, 'content.publish'),
    content,
  };
};

/** One entry's row action from the list. */
const rowAction =
  (run: 'trash' | 'restore' | 'remove', notice: string) =>
  async (event: Parameters<Actions[string]>[0]) => {
    const id = text(await event.request.formData(), 'id');
    try {
      await adminFor(event).content[run](id);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice };
  };

export const actions: Actions = {
  trash: rowAction('trash', 'movedToTrash'),
  restore: rowAction('restore', 'restored'),
  delete: rowAction('remove', 'deleted'),
  /** Quick Edit: replaces the list fields and keeps everything else of the entry. */
  quickEdit: async (event) => {
    const form = await event.request.formData();
    const id = text(form, 'id');
    const admin = adminFor(event);
    try {
      const [entry, autosave] = await Promise.all([
        admin.content.get(id),
        admin.content.pendingAutosave(id),
      ]);
      // Saving would clear the user's autosave, which Quick Edit never showed.
      if (autosave)
        return fail(409, { quickEdit: id, message: Errors.QuickEditAutosave });
      const { input, failure } = readQuickEdit(entry, form);
      if (failure) return failure;
      await admin.content.update(id, input);
    } catch (caught) {
      return failFrom(caught, { quickEdit: id });
    }
    return { notice: 'saved' };
  },
  /** Applies one action to every selected entry; stops at the first failure. */
  bulk: async (event) => {
    const form = await event.request.formData();
    const action = pick(BULK, text(form, 'action'));
    const ids = form.getAll('ids').filter((id) => typeof id === 'string');
    if (!action || !ids.length) return {};
    const content = adminFor(event).content;
    try {
      for (const id of ids)
        if (action === 'trash') await content.trash(id);
        else if (action === 'restore') await content.restore(id);
        else await content.remove(id);
    } catch (caught) {
      return failFrom(caught);
    }
    return {
      notice:
        action === 'trash'
          ? 'movedToTrash'
          : action === 'restore'
            ? 'restored'
            : 'deleted',
    };
  },
};
