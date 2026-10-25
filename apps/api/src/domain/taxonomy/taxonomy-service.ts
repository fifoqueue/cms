import {
  DEFAULT_ENTRY_SEO,
  taxonomyInputSchema,
  taxonomyTypeSchema,
  publicTaxonomyTermSchema,
} from '@cms/sdk';
import type {
  AdminTaxonomyTerm,
  PublicTaxonomyTerm,
  TaxonomyType,
} from '@cms/sdk';
import { slugify, uniqueSlug } from '#api/domain/content/slug';
import { toEntry } from '#api/domain/content/content-mapper';
import type { ContentRepository } from '#api/domain/content/content-repository';
import type { Clock, HookDispatcher, IdGenerator } from '#api/domain/ports';
import {
  toAdminTerm,
  toPublicTerm,
} from '#api/domain/taxonomy/taxonomy-mapper';
import type {
  CountedTermRecord,
  TaxonomyRepository,
} from '#api/domain/taxonomy/taxonomy-repository';
import type { TaxonomyTypeService } from '#api/domain/taxonomy/taxonomy-types';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

/** The taxonomy named in a URL. Unknown taxonomies do not exist (`not_found`). */
const taxonomyOf = (value: string): TaxonomyType => {
  const result = taxonomyTypeSchema.safeParse(value);
  if (!result.success) throw notFound(Errors.TaxonomyNotFound);
  return result.data;
};

export interface TaxonomyServiceDeps {
  content?: Pick<ContentRepository, 'findById'>;
  hooks?: HookDispatcher;
  repository: TaxonomyRepository;
  types?: TaxonomyTypeService;
  ids: IdGenerator;
  clock: Clock;
}

/** Term management. Counts include content of every status. */
export class TaxonomyService {
  constructor(private readonly deps: TaxonomyServiceDeps) {}

  async list(taxonomy: string): Promise<AdminTaxonomyTerm[]> {
    const query = await this.deps.hooks?.applyFilter(
      'term.query',
      { taxonomy },
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        'taxonomy' in value &&
        taxonomyTypeSchema.safeParse(value.taxonomy).success,
    );
    const terms = await this.deps.repository.list(
      await this.kind(query?.taxonomy ?? taxonomy),
      'all',
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
    await this.deps.repository.insert({
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
      parentId: data.parentId,
      createdAt: now,
      updatedAt: now,
    });
    const term = toAdminTerm(await this.require(kind, id));
    void this.deps.hooks?.emit('term.created', term);
    return term;
  }

  /** Replaces editable fields. Omitted `slug` and `seo` are preserved; taxonomy never changes. */
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
    await this.deps.repository.update({
      id,
      taxonomy: kind,
      name: data.name,
      slug,
      description: data.description,
      seo: data.seo ?? current.seo,
      parentId: data.parentId,
      createdAt: current.createdAt,
      updatedAt: this.deps.clock.now(),
    });
    const term = toAdminTerm(await this.require(kind, id));
    void this.deps.hooks?.emit('term.updated', term);
    return term;
  }

  /** Unassigns the term from content; its children move up to its parent. */
  async remove(taxonomy: string, id: string): Promise<void> {
    const term = toAdminTerm(await this.require(await this.kind(taxonomy), id));
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
      throw conflict(Errors.SlugInUse(slug));
  }
}

/** What the public API serves. Counts include published content only. */
export class PublicTaxonomyService {
  constructor(
    private readonly repository: TaxonomyRepository,
    private readonly types?: TaxonomyTypeService,
    private readonly hooks?: HookDispatcher,
  ) {}

  private async kind(taxonomy: string) {
    if (this.types) return (await this.types.require(taxonomy)).key;
    if (taxonomy !== 'category' && taxonomy !== 'tag')
      throw notFound(Errors.TaxonomyNotFound);
    return taxonomyOf(taxonomy);
  }

  async list(taxonomy: string): Promise<PublicTaxonomyTerm[]> {
    const query = await this.hooks?.applyFilter(
      'term.query',
      { taxonomy },
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        'taxonomy' in value &&
        taxonomyTypeSchema.safeParse(value.taxonomy).success,
    );
    const terms = await this.repository.list(
      await this.kind(query?.taxonomy ?? taxonomy),
      'published',
    );
    return Promise.all(terms.map((term) => this.present(toPublicTerm(term))));
  }

  async getBySlug(taxonomy: string, slug: string): Promise<PublicTaxonomyTerm> {
    const record = await this.repository.findBySlug(
      await this.kind(taxonomy),
      slug,
      'published',
    );
    if (!record) throw notFound(Errors.TermNotFound);
    return this.present(toPublicTerm(record));
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
