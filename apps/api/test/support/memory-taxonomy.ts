// In-memory taxonomy adapter for tests, honouring the same port contract as the Prisma adapter.
import type { TaxonomyType } from '@cms/sdk';
import { checkParent, compareTerms } from '#api/domain/taxonomy/hierarchy';
import type {
  CountedTermRecord,
  TaxonomyRepository,
  TaxonomyTermRecord,
  TermCountScope,
} from '#api/domain/taxonomy/taxonomy-repository';
import { conflict } from '#api/shared/errors';
import type { MemoryContentRepository } from '#test/support/memory';

/** Shares the term table and assignments of `content`, like the two Prisma adapters share tables. */
export class MemoryTaxonomyRepository implements TaxonomyRepository {
  constructor(private readonly content: MemoryContentRepository) {}

  get terms() {
    return this.content.terms;
  }

  async list(taxonomy: TaxonomyType, scope: TermCountScope) {
    return [...this.terms.values()]
      .filter((term) => term.taxonomy === taxonomy)
      .sort(compareTerms)
      .map((term) => this.counted(term, scope));
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

  async insert(record: TaxonomyTermRecord) {
    await this.check(record);
    this.terms.set(record.id, structuredClone(record));
  }

  async update(record: TaxonomyTermRecord) {
    const current = this.terms.get(record.id);
    if (!current) return;
    const next = { ...structuredClone(record), taxonomy: current.taxonomy };
    await this.check(next);
    this.terms.set(record.id, next);
  }

  async delete(id: string) {
    const term = this.terms.get(id);
    if (!term) return;
    for (const child of this.terms.values())
      if (child.parentId === id) child.parentId = term.parentId;
    for (const row of this.content.rows.values()) {
      row.categoryIds = row.categoryIds.filter((other) => other !== id);
      row.tagIds = row.tagIds.filter((other) => other !== id);
      row.extraTermIds = row.extraTermIds?.filter((other) => other !== id);
    }
    this.terms.delete(id);
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
