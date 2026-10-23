import { CONTENT_STATUSES, can, contentListQuerySchema } from '@cms/sdk';
import type { ContentStatus } from '@cms/sdk';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { eachBounded, formIds } from '#lib/server/bulk.js';
import { bulkEditInput, readBulkChanges } from '#lib/server/bulk-edit.js';
import { readQuickEdit } from '#lib/server/quick-edit.js';
import { readScreenOptions } from '#lib/server/screen-options.js';
import { CONTENT_COLUMNS } from '#lib/admin/screen-options.js';
import { adminFor } from '#lib/server/session.js';
import { loadTaxonomyChoices } from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

const pick = <T extends string>(options: readonly T[], value: string | null) =>
  options.find((option) => option === value);

/** Bulk actions in the order they appear in the menu. */
const BULK = ['trash', 'restore', 'delete'] as const;

/** Totals only: one-item pages carry the count without the entries. */
const total = (page: Promise<{ total: number }>) =>
  page.then(
    (result) => result.total,
    () => null,
  );

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
  // `YYYY-MM`, as the month input sends it; entries are dated by publication (UTC).
  // Anything the API's list query would reject means "no filter", like the other filters.
  const [, year, month] = /^(\d{4})-(\d{2})$/.exec(params.get('m') ?? '') ?? [];
  const parsed =
    year && contentListQuerySchema.safeParse({ year, month }).success;
  const dated = parsed ? { year: Number(year), month: Number(month) } : null;
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  const screen = readScreenOptions(
    event.cookies,
    'content',
    CONTENT_COLUMNS,
    20,
  );
  // Status view totals follow the type only, like wp-admin.
  const counts = Promise.all([
    total(admin.content.list({ type, pageSize: 1 })),
    ...CONTENT_STATUSES.map((option) =>
      total(admin.content.list({ type, status: option, pageSize: 1 })),
    ),
    total(admin.content.list({ type, view: 'trash', pageSize: 1 })),
  ]);
  const [content, [all, ...rest]] = await Promise.all([
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
      page,
      pageSize: screen.perPage,
    }),
    counts,
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
    counts: {
      all,
      trash: rest.at(-1) ?? null,
      ...Object.fromEntries(
        CONTENT_STATUSES.map((option, index) => [option, rest[index] ?? null]),
      ),
    } as Record<ContentStatus | 'all' | 'trash', number | null>,
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
  trash: rowAction('trash', 'movedToTrash'),
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
    const ids = formIds(form);
    if (!action || !ids.length) return {};
    const content = adminFor(event).content;
    const result = await eachBounded(ids, (id) =>
      action === 'trash'
        ? content.trash(id)
        : action === 'restore'
          ? content.restore(id)
          : content.remove(id),
    );
    return { bulk: result };
  },
  /**
   * Bulk Edit: adds terms and sets author, status, comments or sticky on every selected entry.
   * Each entry is read and saved with its own version check; bodies are copied, never changed.
   */
  bulkEdit: async (event) => {
    const form = await event.request.formData();
    const ids = formIds(form);
    const changes = readBulkChanges(form);
    const admin = adminFor(event);
    const result = await eachBounded(ids, async (id) => {
      const entry = await admin.content.get(id);
      // The version the list showed, so a save made since then is not overwritten.
      const input = bulkEditInput(
        entry,
        changes,
        text(form, `version:${id}`) || entry.updatedAt,
      );
      if (!input) return Errors.FormInvalid;
      await admin.content.update(id, input);
    });
    return { bulk: result };
  },
};
