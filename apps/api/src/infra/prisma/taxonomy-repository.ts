import {
  lockPermalinks,
  refreshContentPaths,
} from '#api/infra/prisma/permalink-repository';
import type { TaxonomyType } from '@cms/sdk';
import { checkParent, compareTerms } from '#api/domain/taxonomy/hierarchy';
import type {
  CountedTermRecord,
  TaxonomyRepository,
  TaxonomyTermRecord,
  TermCountScope,
} from '#api/domain/taxonomy/taxonomy-repository';
import { guardUnique } from '#api/infra/prisma/client';
import { PUBLIC_CONTENT } from '#api/infra/prisma/content-criteria';
import type { Database } from '#api/infra/prisma/client';
import type { Prisma, TaxonomyTerm } from '#api/infra/prisma/generated/client';
import { fromSeoColumns, toSeoColumns } from '#api/infra/prisma/seo-mapper';
import { Errors } from '#api/shared/errors';

/** Row in `settings` whose lock serializes hierarchy writes, so parent checks see a stable tree. */
const HIERARCHY_LOCK = 'taxonomy.hierarchy';

const counted = (scope: TermCountScope) => {
  const where: Prisma.ContentTermWhereInput =
    scope === 'published' ? { content: PUBLIC_CONTENT } : {};
  return { _count: { select: { contents: { where } } } };
};

const toRecord = ({
  _count,
  ...row
}: TaxonomyTerm & { _count: { contents: number } }): CountedTermRecord => ({
  ...row,
  count: _count.contents,
  seo: fromSeoColumns(row),
});

const toRow = ({ seo, ...record }: TaxonomyTermRecord): TaxonomyTerm => ({
  ...record,
  ...toSeoColumns(seo),
});

export class PrismaTaxonomyRepository implements TaxonomyRepository {
  constructor(private readonly db: Database) {}

  async list(taxonomy: TaxonomyType, scope: TermCountScope) {
    const rows = await this.db.taxonomyTerm.findMany({
      where: { taxonomy },
      include: counted(scope),
    });
    return rows.map(toRecord).sort(compareTerms);
  }

  async findById(id: string, scope: TermCountScope) {
    const row = await this.db.taxonomyTerm.findUnique({
      where: { id },
      include: counted(scope),
    });
    return row && toRecord(row);
  }

  async findBySlug(
    taxonomy: TaxonomyType,
    slug: string,
    scope: TermCountScope,
  ) {
    const row = await this.db.taxonomyTerm.findUnique({
      where: { taxonomy_slug: { taxonomy, slug } },
      include: counted(scope),
    });
    return row && toRecord(row);
  }

  async takenSlugs(taxonomy: TaxonomyType, slugs: readonly string[]) {
    const rows = await this.db.taxonomyTerm.findMany({
      where: { taxonomy, slug: { in: [...slugs] } },
      select: { slug: true },
    });
    return new Set(rows.map((row) => row.slug));
  }

  async insert(record: TaxonomyTermRecord) {
    await this.write(async (tx) => {
      await this.checkParent(tx, record);
      await tx.taxonomyTerm.create({ data: toRow(record) });
    });
  }

  async update(record: TaxonomyTermRecord) {
    await this.write(async (tx) => {
      // The stored taxonomy wins: a term never changes kind.
      const { taxonomy } = await tx.taxonomyTerm.findUniqueOrThrow({
        where: { id: record.id },
        select: { taxonomy: true },
      });
      await this.checkParent(tx, { ...record, taxonomy });
      const { id, ...data } = toRow({ ...record, taxonomy });
      await tx.taxonomyTerm.update({ where: { id }, data });
      // A new slug or parent changes what term filters match: rebuild the search index.
      await tx.searchOutbox.create({ data: { contentId: null } });
      await refreshContentPaths(tx);
    });
  }

  async delete(id: string) {
    await this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const term = await tx.taxonomyTerm.findUnique({ where: { id } });
      if (!term) return;
      await tx.taxonomyTerm.updateMany({
        where: { parentId: id },
        data: { parentId: term.parentId },
      });
      // Assignments go with it (ON DELETE CASCADE).
      await tx.taxonomyTerm.delete({ where: { id } });
      await tx.searchOutbox.create({ data: { contentId: null } });
      await refreshContentPaths(tx);
    });
  }

  /** Runs `save` under the hierarchy lock; a taken slug becomes `conflict`. */
  private async write(save: (tx: Prisma.TransactionClient) => Promise<void>) {
    await guardUnique(
      () =>
        this.db.$transaction(async (tx) => {
          await this.lock(tx);
          await save(tx);
        }),
      Errors.SlugConflict,
    );
  }

  private checkParent(
    tx: Prisma.TransactionClient,
    record: TaxonomyTermRecord,
  ) {
    return checkParent(record, (id) =>
      tx.taxonomyTerm.findUnique({
        where: { id },
        select: { id: true, taxonomy: true, parentId: true },
      }),
    );
  }

  /** First statement of the transaction, so every read after it sees the locked tree. */
  private async lock(tx: Prisma.TransactionClient) {
    await lockPermalinks(tx);
    await tx.$executeRaw`INSERT INTO settings (\`key\`, value) VALUES (${HIERARCHY_LOCK}, 'true') ON DUPLICATE KEY UPDATE value = 'true'`;
  }
}
