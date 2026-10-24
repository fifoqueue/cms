import { fail } from '@sveltejs/kit';
import { adminEntrySeoFields, taxonomyInputSchema } from '@cms/sdk';
import type { AdminTaxonomyTerm, TaxonomyType } from '@cms/sdk';
import type { SeoFormValues } from '#lib/admin/seo.js';
import type { FormFailure } from '#lib/server/errors.js';
import { Errors, failFrom, issuesOf, text } from '#lib/server/errors.js';
import { loadSeoContext, readSeoForm } from '#lib/server/seo-admin.js';
import { adminFor } from '#lib/server/session.js';

interface AdminEvent {
  fetch: typeof globalThis.fetch;
  locals: App.Locals;
  request: Request;
  url: URL;
}

/** The term fields admin pages show. */
export const adminTermView = ({
  id,
  taxonomy,
  name,
  slug,
  description,
  parentId,
  count,
  seo,
}: AdminTaxonomyTerm) => ({
  id,
  taxonomy,
  name,
  slug,
  description,
  parentId,
  count,
  seo: adminEntrySeoFields(seo),
});

export type AdminTermView = ReturnType<typeof adminTermView>;

/** What the term form submitted, echoed back after a failed save. */
export interface TermFormValues {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string;
  /** Absent when the form had no SEO fieldset; the API then keeps the stored SEO. */
  seo?: SeoFormValues;
}

export type TermIntent = 'create' | 'update';

export const loadTerms = async (event: AdminEvent, taxonomy: TaxonomyType) => {
  const [list, seo] = await Promise.all([
    adminFor(event).taxonomy.list(taxonomy),
    loadSeoContext(event),
  ]);
  const terms = list.map(adminTermView);
  const editId = event.url.searchParams.get('edit');
  return {
    terms,
    editing: terms.find((term) => term.id === editId) ?? null,
    seo,
  };
};

const termChoice = ({ id, name, slug, parentId }: AdminTaxonomyTerm) => ({
  id,
  name,
  slug,
  parentId,
});

/** Every category, tag and custom taxonomy term, for filtering content by them. */
export const loadTaxonomyChoices = async (
  event: Omit<AdminEvent, 'request' | 'url'>,
) => {
  const admin = adminFor(event);
  const [categories, tags, types] = await Promise.all([
    admin.taxonomy.list('category'),
    admin.taxonomy.list('tag'),
    admin.taxonomyTypes.list(),
  ]);
  const extraTaxonomies = await Promise.all(
    types
      .filter((type) => type.key !== 'category' && type.key !== 'tag')
      .map(async (definition) => ({
        key: definition.key,
        name: definition.name,
        hierarchical: definition.hierarchical,
        terms: (await admin.taxonomy.list(definition.key)).map(termChoice),
      })),
  );
  return {
    extraTaxonomies,
    categories: categories.map(termChoice),
    tags: tags.map(termChoice),
  };
};

/** Every page, as parent choices in the editor. */
const loadParentPages = async (event: Omit<AdminEvent, 'request' | 'url'>) => {
  const admin = adminFor(event);
  const parentPages: { id: string; title: string }[] = [];
  for (let page = 1; ; page++) {
    const result = await admin.content.list({
      type: 'page',
      orderBy: 'menuOrder',
      order: 'asc',
      page,
      pageSize: 100,
    });
    parentPages.push(...result.items.map(({ id, title }) => ({ id, title })));
    if (page * result.pageSize >= result.total) break;
  }
  return parentPages;
};

/** Every term and page, for assigning terms and a parent to content in the editor. */
export const loadTermChoices = async (
  event: Omit<AdminEvent, 'request' | 'url'>,
) => {
  const [terms, parentPages] = await Promise.all([
    loadTaxonomyChoices(event),
    loadParentPages(event),
  ]);
  return { ...terms, parentPages };
};

const readTermForm = (
  form: FormData,
  taxonomy: TaxonomyType,
  intent: TermIntent,
) => {
  const values: TermFormValues = {
    id: text(form, 'id'),
    name: text(form, 'name'),
    slug: text(form, 'slug'),
    description: text(form, 'description'),
    // Tags are flat: a parent is never sent for them.
    parentId: taxonomy !== 'tag' ? text(form, 'parentId') : '',
    seo: readSeoForm(form),
  };
  const result = taxonomyInputSchema.safeParse({
    name: values.name,
    slug: values.slug.trim() || undefined,
    description: values.description,
    parentId: values.parentId || null,
    seo: values.seo,
  });
  if (result.success) return { values, input: result.data };
  return {
    values,
    failure: fail(400, {
      intent,
      values,
      message: Errors.FormInvalid,
      issues: issuesOf(result.error.issues),
    } satisfies FormFailure & { intent: TermIntent; values: TermFormValues }),
  };
};

/** Creates or updates a term from the submitted form. */
export const saveTerm = async (
  event: AdminEvent,
  taxonomy: TaxonomyType,
  intent: TermIntent,
) => {
  const { values, input, failure } = readTermForm(
    await event.request.formData(),
    taxonomy,
    intent,
  );
  if (failure) return failure;
  const admin = adminFor(event);
  try {
    const term =
      intent === 'create'
        ? await admin.taxonomy.create(taxonomy, input)
        : await admin.taxonomy.update(taxonomy, values.id, input);
    return {
      intent,
      notice:
        intent === 'create'
          ? term.taxonomy === 'category'
            ? 'categoryAdded'
            : 'tagAdded'
          : 'saved',
    };
  } catch (caught) {
    return failFrom(caught, { intent, values });
  }
};

export const removeTerm = async (event: AdminEvent, taxonomy: TaxonomyType) => {
  const id = text(await event.request.formData(), 'id');
  try {
    await adminFor(event).taxonomy.remove(taxonomy, id);
  } catch (caught) {
    return failFrom(caught);
  }
  return { notice: 'deleted' };
};
