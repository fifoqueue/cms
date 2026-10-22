import type { AdminEntrySeo, TaxonomyType } from '@cms/sdk';

export interface TaxonomyTermRecord {
  id: string;
  /** Immutable after creation. */
  taxonomy: TaxonomyType;
  name: string;
  /** Unique within its taxonomy. */
  slug: string;
  description: string;
  /** Always null for tags. */
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  seo: AdminEntrySeo;
}

export interface CountedTermRecord extends TaxonomyTermRecord {
  /** Content assigned to the term, within the requested scope. */
  count: number;
}

/** Content counted toward a term: every item (admin) or published items only (public). */
export type TermCountScope = 'all' | 'published';

/**
 * Terms and their hierarchy. Every implementation enforces relation integrity itself:
 * `insert`/`update` throw `conflict` when the slug is taken within the taxonomy and
 * `invalid_input` (see `checkParent`) when the parent is missing, in another taxonomy, the term
 * itself or one of its descendants, or when a tag has a parent.
 */
export interface TaxonomyRepository {
  /** Terms of one taxonomy, ordered by `compareTerms`. */
  list(
    taxonomy: TaxonomyType,
    scope: TermCountScope,
  ): Promise<CountedTermRecord[]>;
  findById(
    id: string,
    scope: TermCountScope,
  ): Promise<CountedTermRecord | null>;
  findBySlug(
    taxonomy: TaxonomyType,
    slug: string,
    scope: TermCountScope,
  ): Promise<CountedTermRecord | null>;
  /** The subset of `slugs` already used in `taxonomy`, in one read. */
  takenSlugs(
    taxonomy: TaxonomyType,
    slugs: readonly string[],
  ): Promise<Set<string>>;
  insert(record: TaxonomyTermRecord): Promise<void>;
  /** The taxonomy of `record` is ignored; the stored one is kept. */
  update(record: TaxonomyTermRecord): Promise<void>;
  /** Unassigns the term from all content and moves its children up to its parent. */
  delete(id: string): Promise<void>;
}
