import {
  DEFAULT_ENTRY_SEO,
  taxonomyInputSchema,
  taxonomyTypeSchema,
} from '@cms/sdk';
import type {
  AdminTaxonomyTerm,
  PublicTaxonomyTerm,
  TaxonomyType,
} from '@cms/sdk';
import { slugify, uniqueSlug } from '#api/domain/content/slug';
import type { Clock, IdGenerator } from '#api/domain/ports';
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
  repository: TaxonomyRepository;
  types?: TaxonomyTypeService;
  ids: IdGenerator;
  clock: Clock;
}

/** Term management. Counts include content of every status. */
export class TaxonomyService {
  constructor(private readonly deps: TaxonomyServiceDeps) {}

  async list(taxonomy: string): Promise<AdminTaxonomyTerm[]> {
    const terms = await this.deps.repository.list(
      await this.kind(taxonomy),
      'all',
    );
    return terms.map(toAdminTerm);
  }

  async create(taxonomy: string, input: unknown): Promise<AdminTaxonomyTerm> {
    const kind = await this.kind(taxonomy);
    const data = parseInput(taxonomyInputSchema, input);
    if (
      data.parentId &&
      this.deps.types &&
      !(await this.deps.types.require(kind)).hierarchical
    )
      throw invalidInput(Errors.TermParentNotCategory);
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
    return toAdminTerm(await this.require(kind, id));
  }

  /** Replaces editable fields. Omitted `slug` and `seo` are preserved; taxonomy never changes. */
  async update(
    taxonomy: string,
    id: string,
    input: unknown,
  ): Promise<AdminTaxonomyTerm> {
    const kind = await this.kind(taxonomy);
    const current = await this.require(kind, id);
    const data = parseInput(taxonomyInputSchema, input);
    if (
      data.parentId &&
      this.deps.types &&
      !(await this.deps.types.require(kind)).hierarchical
    )
      throw invalidInput(Errors.TermParentNotCategory);
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
    return toAdminTerm(await this.require(kind, id));
  }

  /** Unassigns the term from content; its children move up to its parent. */
  async remove(taxonomy: string, id: string): Promise<void> {
    await this.require(await this.kind(taxonomy), id);
    await this.deps.repository.delete(id);
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
  ) {}

  private async kind(taxonomy: string) {
    if (this.types) return (await this.types.require(taxonomy)).key;
    if (taxonomy !== 'category' && taxonomy !== 'tag')
      throw notFound(Errors.TaxonomyNotFound);
    return taxonomyOf(taxonomy);
  }

  async list(taxonomy: string): Promise<PublicTaxonomyTerm[]> {
    const terms = await this.repository.list(
      await this.kind(taxonomy),
      'published',
    );
    return terms.map(toPublicTerm);
  }

  async getBySlug(taxonomy: string, slug: string): Promise<PublicTaxonomyTerm> {
    const record = await this.repository.findBySlug(
      await this.kind(taxonomy),
      slug,
      'published',
    );
    if (!record) throw notFound(Errors.TermNotFound);
    return toPublicTerm(record);
  }
}
