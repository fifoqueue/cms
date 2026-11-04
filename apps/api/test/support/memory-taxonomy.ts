// In-memory taxonomy adapter for tests, honouring the same port contract as the Prisma adapter.
import type { TaxonomyType } from '@cms/sdk';
import { checkParent, sortTerms } from '#api/domain/taxonomy/hierarchy';
import type {
  CountedTermRecord,
  TaxonomyRepository,
  TaxonomyTermRecord,
  TermCountScope,
  TermListFilter,
  TermMediaLinks,
} from '#api/domain/taxonomy/taxonomy-repository';
import { conflict } from '#api/shared/errors';
import type { MemoryContentRepository } from '#test/support/memory';

/** Shares the term table and assignments of `content`, like the two Prisma adapters share tables. */
export class MemoryTaxonomyRepository implements TaxonomyRepository {
  constructor(private readonly content: MemoryContentRepository) {}

  get terms() {
    return this.content.terms;
  }

  async list(
    taxonomy: TaxonomyType,
    scope: TermCountScope,
    filter: TermListFilter = {},
  ) {
    const search = filter.search?.toLowerCase();

    return sortTerms(
      [...this.terms.values()]
        .filter(
          (term) =>
            term.taxonomy === taxonomy &&
            (filter.parentId === undefined ||
              term.parentId === filter.parentId) &&
            (!search ||
              term.name.toLowerCase().includes(search) ||
              term.slug.includes(search)),
        )
        .map((term) => this.counted(term, scope))
        .filter((term) => !filter.hideEmpty || term.count > 0),
      filter,
    );
  }

  async findById(id: string, scope: TermCountScope) {
    const term = this.terms.get(id);

    return term ? this.counted(term, scope) : null;
  }

  async findBySlug(
    taxonomy: TaxonomyType,
    slug: string,
    scope: TermCountScope,
  ) {
    const term = [...this.terms.values()].find(
      (term) => term.taxonomy === taxonomy && term.slug === slug,
    );

    return term ? this.counted(term, scope) : null;
  }

  async takenSlugs(taxonomy: TaxonomyType, slugs: readonly string[]) {
    return new Set(
      [...this.terms.values()]
        .filter(
          (term) => term.taxonomy === taxonomy && slugs.includes(term.slug),
        )
        .map((term) => term.slug),
    );
  }

  /** Media linked by each term's image fields, standing in for `term_media` (no existence check). */
  readonly media = new Map<string, string[]>();

  async insert(record: TaxonomyTermRecord, mediaIds: readonly string[] = []) {
    await this.check(record);
    this.terms.set(record.id, structuredClone(record));
    this.media.set(record.id, [...new Set(mediaIds)]);
  }

  async update(record: TaxonomyTermRecord, media?: TermMediaLinks) {
    const current = this.terms.get(record.id);

    if (!current) return;
    const next = { ...structuredClone(record), taxonomy: current.taxonomy };

    await this.check(next);
    this.terms.set(record.id, next);
    if (media)
      this.media.set(record.id, [
        ...new Set([
          ...(this.media.get(record.id) ?? []).filter((id) =>
            media.retain.includes(id),
          ),
          ...media.ids,
        ]),
      ]);
  }

  async delete(id: string) {
    const term = this.terms.get(id);

    if (!term) return [];
    const affected: string[] = [];

    for (const child of this.terms.values())
      if (child.parentId === id) child.parentId = term.parentId;

    for (const row of this.content.rows.values()) {
      if (
        [
          ...row.categoryIds,
          ...row.tagIds,
          ...(row.extraTermIds ?? []),
        ].includes(id)
      )
        affected.push(row.id);
      row.categoryIds = row.categoryIds.filter((other) => other !== id);
      row.tagIds = row.tagIds.filter((other) => other !== id);
      row.extraTermIds = row.extraTermIds?.filter((other) => other !== id);
    }

    this.terms.delete(id);
    this.media.delete(id);

    return affected;
  }

  private async check(record: TaxonomyTermRecord) {
    await checkParent(record, async (id) => this.terms.get(id) ?? null);
    const taken = [...this.terms.values()].some(
      (term) =>
        term.id !== record.id &&
        term.taxonomy === record.taxonomy &&
        term.slug === record.slug,
    );

    if (taken) throw conflict('Slug is already in use');
  }

  private counted(
    term: TaxonomyTermRecord,
    scope: TermCountScope,
  ): CountedTermRecord {
    const count = [...this.content.rows.values()].filter(
      (row) =>
        (scope === 'all' || row.status === 'published') &&
        [
          ...row.categoryIds,
          ...row.tagIds,
          ...(row.extraTermIds ?? []),
        ].includes(term.id),
    ).length;

    return { ...structuredClone(term), count };
  }
}
