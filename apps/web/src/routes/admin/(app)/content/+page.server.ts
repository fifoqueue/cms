import { redirect } from '@sveltejs/kit';
import {
  CONTENT_ORDERS,
  CONTENT_STATUSES,
  can,
  contentListQuerySchema,
} from '@cms/sdk';
import type { ContentStatus } from '@cms/sdk';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { eachBounded, readSelection } from '#lib/server/bulk.js';
import { bulkEditInput, readBulkChanges } from '#lib/server/bulk-edit.js';
import { readQuickEdit } from '#lib/server/quick-edit.js';
import { clampPage } from '#lib/server/page-range.js';
import { readScreenOptions } from '#lib/server/screen-options.js';
import { CONTENT_COLUMNS } from '#lib/admin/screen-options.js';
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
  // Sorting: only the SDK's allowlisted columns; anything else is the default order.
  const orderby = pick(CONTENT_ORDERS, params.get('orderby'));
  const order = orderby
    ? pick(['asc', 'desc'] as const, params.get('order'))
    : undefined;
  const screen = readScreenOptions(
    event.cookies,
    'content',
    CONTENT_COLUMNS,
    20,
  );
  // Status view totals follow the type only, like wp-admin.
  const [content, counts] = await Promise.all([
    admin.content.list({
      type,
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
      orderBy: orderby ?? (type === 'page' ? 'menuOrder' : 'updatedAt'),
      order: order ?? (!orderby && type === 'page' ? 'asc' : 'desc'),
      page,
      pageSize: screen.perPage,
    }),
    admin.content.counts(type),
  ]);
  clampPage(event.url, content);
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
      orderby,
      order,
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
    screen,
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
  /** The notice and its Undo (restore) travel in the address, shown by `FlashNotice`. */
  trash: async (event) => {
    const id = text(await event.request.formData(), 'id');
    try {
      await adminFor(event).content.trash(id);
    } catch (caught) {
      return failFrom(caught);
    }
    const params = new URLSearchParams(event.url.search);
    params.delete('/trash');
    params.set('notice', 'entryTrashed');
    params.set('undo', id);
    redirect(303, `${event.url.pathname}?${params}`);
  },
  restore: rowAction('restore', 'restored'),
  delete: rowAction('remove', 'deleted'),
  /** Quick Edit: replaces the list fields and keeps everything else of the entry. */
  quickEdit: async (event) => {
    const form = await event.request.formData();
    const id = text(form, 'id');
    const admin = adminFor(event);
    try {
      const { input, failure } = readQuickEdit(
        await admin.content.get(id),
        form,
      );
      if (failure) return failure;
      await admin.content.update(id, input);
    } catch (caught) {
      return failFrom(caught, { quickEdit: id });
    }
    return { notice: 'saved' };
  },
  /** Applies one action to every selected entry and reports the ones that failed. */
  bulk: async (event) => {
    const form = await event.request.formData();
    const action = pick(BULK, text(form, 'action'));
    const selection = readSelection(form);
    if (selection.failure) return selection.failure;
    if (!action) return {};
    const content = adminFor(event).content;
    const result = await eachBounded(
      selection.ids,
      (id) =>
        action === 'trash'
          ? content.trash(id)
          : action === 'restore'
            ? content.restore(id)
            : content.remove(id),
      selection.invalid,
    );
    return { bulk: result };
  },
  /**
   * Bulk Edit: adds terms and sets author, status, comments or sticky on every selected entry.
   * Each entry is read and saved with its own version check; bodies are copied, never changed.
   */
  bulkEdit: async (event) => {
    const form = await event.request.formData();
    const selection = readSelection(form);
    if (selection.failure) return selection.failure;
    const changes = readBulkChanges(form);
    const admin = adminFor(event);
    const result = await eachBounded(
      selection.ids,
      async (id) => {
        const entry = await admin.content.get(id);
        // The version the list showed, so a save made since then is not overwritten.
        const input = bulkEditInput(
          entry,
          changes,
          text(form, `version:${id}`) || entry.updatedAt,
        );
        if (!input) return Errors.FormInvalid;
        await admin.content.update(id, input);
      },
      selection.invalid,
    );
    return { bulk: result };
  },
};
