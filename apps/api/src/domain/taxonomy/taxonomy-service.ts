import {
  DEFAULT_ENTRY_SEO,
  taxonomyInputSchema,
  taxonomyTypeSchema,
  publicTaxonomyTermSchema,
} from '@cms/sdk';
import type {
  AdminTaxonomyTerm,
  FieldValues,
  PublicTaxonomyTerm,
  TaxonomyType,
  TermQuery,
} from '@cms/sdk';
import { slugify, uniqueSlug } from '#api/domain/content/slug';
import { toEntry } from '#api/domain/content/content-mapper';
import type { ContentRepository } from '#api/domain/content/content-repository';
import { fieldMediaIds, retainedMediaIds } from '#api/domain/content/fields';
import type { FieldService } from '#api/domain/content/fields';
import type { Clock, HookDispatcher, IdGenerator } from '#api/domain/ports';
import {
  toAdminTerm,
  toPublicTerm,
} from '#api/domain/taxonomy/taxonomy-mapper';
import type {
  CountedTermRecord,
  TaxonomyRepository,
  TermListFilter,
  TermMediaLinks,
} from '#api/domain/taxonomy/taxonomy-repository';
import type { TaxonomyTypeService } from '#api/domain/taxonomy/taxonomy-types';
import { termQuery } from '#api/domain/taxonomy/term-query';
import {
  conflict,
  forbidden,
  invalidInput,
  notFound,
  Errors,
} from '#api/shared/errors';
import { withParams } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

/** The taxonomy named in a URL. Unknown taxonomies do not exist (`not_found`). */
const taxonomyOf = (value: string): TaxonomyType => {
  const result = taxonomyTypeSchema.safeParse(value);
  if (!result.success) throw notFound(Errors.TaxonomyNotFound);
  return result.data;
};

/** The repository filter of validated list arguments. */
const filterOf = ({ taxonomy: _, ...filter }: TermQuery): TermListFilter =>
  filter;

/** Whether `kind` resolves `taxonomy` (unknown taxonomies throw `not_found`). */
const resolves = (
  kind: (taxonomy: string) => Promise<TaxonomyType>,
  taxonomy: string,
) =>
  kind(taxonomy).then(
    () => true,
    () => false,
  );

export interface TaxonomyServiceDeps {
  content?: Pick<ContentRepository, 'findById'>;
  hooks?: HookDispatcher;
  /** Term field definitions; without them no term field is declared. */
  fields?: Pick<FieldService, 'validateTerm' | 'forTaxonomy'>;
  repository: TaxonomyRepository;
  types?: TaxonomyTypeService;
  ids: IdGenerator;
  clock: Clock;
}

/** Term management. Counts include content of every status. */
export class TaxonomyService {
  constructor(private readonly deps: TaxonomyServiceDeps) {}

  async list(taxonomy: string): Promise<AdminTaxonomyTerm[]> {
    const query = await termQuery(
      this.deps.hooks,
      await this.kind(taxonomy),
      'admin',
      (other) => resolves((key) => this.kind(key), other),
    );
    const terms = await this.deps.repository.list(
      query.taxonomy,
      'all',
      filterOf(query),
    );
    return terms.map(toAdminTerm);
  }

  async create(taxonomy: string, input: unknown): Promise<AdminTaxonomyTerm> {
    const kind = await this.kind(taxonomy);
    const data = await this.prepare(input);
    await this.assertParent(kind, data.parentId);
    const id = this.deps.ids.next();
    const now = this.deps.clock.now();
    if (data.slug) await this.assertSlugFree(kind, data.slug);
    const fields = await this.fields(kind, data.fields ?? {}, {});
    await this.deps.repository.insert(
      {
        id,
        taxonomy: kind,
        name: data.name,
        slug:
          data.slug ??
          (await uniqueSlug(
            slugify(data.name) || `${kind}-${id.slice(-12)}`,
            (candidates) => this.deps.repository.takenSlugs(kind, candidates),
            () => this.deps.ids.next().slice(-8),
          )),
        description: data.description,
        seo: data.seo ?? { ...DEFAULT_ENTRY_SEO },
        fields: fields.values,
        parentId: data.parentId,
        createdAt: now,
        updatedAt: now,
      },
      fields.media?.ids,
    );
    const term = toAdminTerm(await this.require(kind, id));
    void this.deps.hooks?.emit('term.created', term);
    return term;
  }

  /** Replaces editable fields. Omitted `slug`, `seo` and `fields` are preserved; taxonomy never changes. */
  async update(
    taxonomy: string,
    id: string,
    input: unknown,
  ): Promise<AdminTaxonomyTerm> {
    const kind = await this.kind(taxonomy);
    const current = await this.require(kind, id);
    const data = await this.prepare(input);
    await this.assertParent(kind, data.parentId);
    const slug = data.slug ?? current.slug;
    if (slug !== current.slug) await this.assertSlugFree(kind, slug);
    // Omitted values keep the stored ones and their media links.
    const fields =
      data.fields === undefined
        ? { values: current.fields }
        : await this.fields(kind, data.fields, current.fields);
    await this.deps.repository.update(
      {
        id,
        taxonomy: kind,
        name: data.name,
        slug,
        description: data.description,
        seo: data.seo ?? current.seo,
        fields: fields.values,
        parentId: data.parentId,
        createdAt: current.createdAt,
        updatedAt: this.deps.clock.now(),
      },
      fields.media,
    );
    const term = toAdminTerm(await this.require(kind, id));
    void this.deps.hooks?.emit('term.updated', term);
    return term;
  }

  /**
   * Unassigns the term from content and drops its field values; its children move up to its
   * parent. Callers authorize first; `term.deleteAllowed` may then refuse or allow (`forbidden`).
   */
  async remove(taxonomy: string, id: string): Promise<void> {
    const term = toAdminTerm(await this.require(await this.kind(taxonomy), id));
    const allowed = await this.deps.hooks?.applyFilter(
      'term.deleteAllowed',
      true,
      (value) => typeof value === 'boolean',
      undefined,
      [{ term }],
    );
    if (allowed === false) throw forbidden();
    const affected = await this.deps.repository.delete(id);
    void this.deps.hooks?.emit('term.deleted', term);
    for (const contentId of affected) {
      const content = await this.deps.content?.findById(contentId);
      if (content)
        void this.deps.hooks?.emit('content.termsChanged', toEntry(content));
    }
  }

  private async prepare(input: unknown) {
    const data = parseInput(taxonomyInputSchema, input);
    const filtered = await this.deps.hooks?.applyFilter(
      'term.beforeSave',
      data,
      (value) => taxonomyInputSchema.safeParse(value).success,
    );
    return taxonomyInputSchema.parse(filtered ?? data);
  }

  /**
   * Values checked against the taxonomy's term fields (see `FieldService.validateTerm`) and the
   * files its image fields point at, which count as media usage.
   */
  private async fields(
    kind: TaxonomyType,
    values: FieldValues,
    stored: FieldValues,
  ): Promise<{ values: FieldValues; media?: TermMediaLinks }> {
    if (!this.deps.fields) return { values: stored };
    const checked = await this.deps.fields.validateTerm(kind, values, stored);
    const definitions = await this.deps.fields.forTaxonomy(kind);
    return {
      values: checked,
      media: {
        ids: fieldMediaIds(definitions, checked),
        retain: retainedMediaIds(definitions, checked),
      },
    };
  }

  private async kind(taxonomy: string) {
    if (this.deps.types) return (await this.deps.types.require(taxonomy)).key;
    if (taxonomy !== 'category' && taxonomy !== 'tag')
      throw notFound(Errors.TaxonomyNotFound);
    return taxonomyOf(taxonomy);
  }

  /** The term, only within the taxonomy named in the URL. */
  private async require(
    taxonomy: TaxonomyType,
    id: string,
  ): Promise<CountedTermRecord> {
    const record = await this.deps.repository.findById(id, 'all');
    if (record?.taxonomy !== taxonomy) throw notFound(Errors.TermNotFound);
    return record;
  }

  private async assertParent(kind: string, parentId: string | null) {
    if (
      parentId &&
      this.deps.types &&
      !(await this.deps.types.require(kind)).hierarchical
    )
      throw invalidInput(Errors.TermParentNotCategory);
  }

  private async assertSlugFree(
    taxonomy: TaxonomyType,
    slug: string,
  ): Promise<void> {
    if ((await this.deps.repository.takenSlugs(taxonomy, [slug])).size)
      throw conflict(
        Errors.SlugInUse,
        withParams(Errors.SlugInUse, { slug }, 'slug'),
      );
  }
}

/** What the public API serves. Counts include published content only. */
export class PublicTaxonomyService {
  constructor(
    private readonly repository: TaxonomyRepository,
    private readonly types?: TaxonomyTypeService,
    private readonly hooks?: HookDispatcher,
    /** Public term field projection; without it terms serve no fields. */
    private readonly fields?: Pick<FieldService, 'presentTerms'>,
  ) {}

  private async kind(taxonomy: string) {
    if (this.types) return (await this.types.require(taxonomy)).key;
    if (taxonomy !== 'category' && taxonomy !== 'tag')
      throw notFound(Errors.TaxonomyNotFound);
    return taxonomyOf(taxonomy);
  }

  async list(taxonomy: string): Promise<PublicTaxonomyTerm[]> {
    const query = await termQuery(
      this.hooks,
      await this.kind(taxonomy),
      'public',
      (other) => resolves((key) => this.kind(key), other),
    );
    const terms = await this.repository.list(
      query.taxonomy,
      'published',
      filterOf(query),
    );
    return this.presentAll(query.taxonomy, terms);
  }

  async getBySlug(taxonomy: string, slug: string): Promise<PublicTaxonomyTerm> {
    const kind = await this.kind(taxonomy);
    const record = await this.repository.findBySlug(kind, slug, 'published');
    if (!record) throw notFound(Errors.TermNotFound);
    const [term] = await this.presentAll(kind, [record]);
    return term!;
  }

  private async presentAll(kind: TaxonomyType, records: CountedTermRecord[]) {
    const fields = await this.fields?.presentTerms(
      kind,
      records.map((record) => record.fields),
    );
    return Promise.all(
      records.map((record, index) =>
        this.present(toPublicTerm(record, fields?.[index] ?? {})),
      ),
    );
  }

  private async present(term: PublicTaxonomyTerm) {
    const filtered = await this.hooks?.applyFilter(
      'term.public',
      term,
      (value) => publicTaxonomyTermSchema.safeParse(value).success,
    );
    return publicTaxonomyTermSchema.parse(filtered ?? term);
  }
}
