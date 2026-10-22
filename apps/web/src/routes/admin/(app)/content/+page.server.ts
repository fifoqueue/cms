import { CONTENT_STATUSES } from '@cms/sdk';
import type { ContentStatus } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import { loadTermChoices } from '#lib/server/taxonomy-admin.js';
import type { Actions, PageServerLoad } from './$types';

const pick = <T extends string>(options: readonly T[], value: string | null) =>
  options.find((option) => option === value);

/** Bulk actions in the order they appear in the menu. */
const BULK = ['trash', 'restore', 'delete'] as const;

export const load: PageServerLoad = async (event) => {
  const params = event.url.searchParams;
  const model = await adminFor(event).contentModel.model();
  const type = pick(
    model.types.map(({ key }) => key),
    params.get('type'),
  );
  const status = pick<ContentStatus>(CONTENT_STATUSES, params.get('status'));
  const view = params.get('view') === 'trash' ? 'trash' : 'active';
  const terms = await loadTermChoices(event);
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
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  return {
    filter: { type, status, view, category, tag, taxonomy, term, q: search },
    types: model.types.map(({ key, name, builtin }) => ({
      key,
      name,
      builtin,
    })),
    ...terms,
    content: await adminFor(event).content.list({
      type,
      status,
      view,
      category,
      tag,
      taxonomy,
      term,
      search,
      page,
      pageSize: 20,
    }),
  };
};

export const actions: Actions = {
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
