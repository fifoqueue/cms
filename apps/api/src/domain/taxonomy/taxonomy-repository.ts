import type {
  AdminEntrySeo,
  FieldValues,
  TaxonomyType,
  TermQuery,
} from '@cms/sdk';

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
  /** Term field values by key; removed with the term. */
  fields: FieldValues;
}

export interface CountedTermRecord extends TaxonomyTermRecord {
  /** Content assigned to the term, within the requested scope. */
  count: number;
}

/** Content counted toward a term: every item (admin) or published items only (public). */
export type TermCountScope = 'all' | 'published';

/** Files a term's field values point at (see `TaxonomyRepository.update`). */
export interface TermMediaLinks {
  /** Image field values: linked when the file exists. */
  ids: readonly string[];
  /** Values of inactive fields: existing links stay, none are added. */
  retain: readonly string[];
}

/** Validated list arguments besides the taxonomy; `hideEmpty` counts within the list's scope. */
export type TermListFilter = Omit<TermQuery, 'taxonomy'>;

/**
 * Terms and their hierarchy. Every implementation enforces relation integrity itself:
 * `insert`/`update` throw `conflict` when the slug is taken within the taxonomy and
 * `invalid_input` (see `checkParent`) when the parent is missing, in another taxonomy, the term
 * itself or one of its descendants, or when a tag has a parent.
 */
export interface TaxonomyRepository {
  /** Terms of one taxonomy matching `filter`, ordered by `sortTerms` (`compareTerms` by default). */
  list(
    taxonomy: TaxonomyType,
    scope: TermCountScope,
    filter?: TermListFilter,
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
  /** The subset of `slugs` already used in `taxonomy`, in one read, compared as the store's unique index compares them. */
  takenSlugs(
    taxonomy: TaxonomyType,
    slugs: readonly string[],
  ): Promise<Set<string>>;
  /**
   * `mediaIds` are the files the term's image fields point at, counted as media usage (ids of
   * missing files are skipped).
   */
  insert(
    record: TaxonomyTermRecord,
    mediaIds?: readonly string[],
  ): Promise<void>;
  /**
   * The taxonomy of `record` is ignored; the stored one is kept. `media` replaces the stored
   * links with `ids`, except existing links to `retain` (values of inactive fields), which stay;
   * omitted keeps every link.
   */
  update(record: TaxonomyTermRecord, media?: TermMediaLinks): Promise<void>;
  /** Unassigns the term, reparents children, and returns affected content IDs after commit. */
  delete(id: string): Promise<string[]>;
}
