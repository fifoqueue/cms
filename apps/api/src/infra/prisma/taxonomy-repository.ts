import {
  lockPermalinks,
  queueContentPaths,
} from '#api/infra/prisma/permalink-repository';
import type { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';
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
import { guardUnique } from '#api/infra/prisma/client';
import {
  parseFields,
  PUBLIC_CONTENT,
} from '#api/infra/prisma/content-criteria';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import type { TaxonomyTerm } from '#api/infra/prisma/generated/client';
import { takenSlugs } from '#api/infra/prisma/taken-slugs';
import { fromSeoColumns, toSeoColumns } from '#api/infra/prisma/seo-mapper';
import { Errors } from '#api/shared/errors';

/** Row in `settings` whose lock serializes hierarchy writes, so parent checks see a stable tree. */
const HIERARCHY_LOCK = 'taxonomy.hierarchy';

/** Assignments counted toward a term in `scope`. */
const assigned = (scope: TermCountScope): Prisma.ContentTermWhereInput =>
  scope === 'published' ? { content: PUBLIC_CONTENT } : {};

const counted = (scope: TermCountScope) => ({
  _count: { select: { contents: { where: assigned(scope) } } },
});

/** LIKE pattern text matching `value` literally (Prisma `contains` does not escape wildcards). */
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const matching = (
  taxonomy: TaxonomyType,
  scope: TermCountScope,
  { parentId, search, hideEmpty }: TermListFilter,
): Prisma.TaxonomyTermWhereInput => ({
  taxonomy,
  ...(parentId === undefined ? {} : { parentId }),
  ...(search
    ? {
        OR: [
          { name: { contains: literal(search) } },
          { slug: { contains: literal(search) } },
        ],
      }
    : {}),
  ...(hideEmpty ? { contents: { some: assigned(scope) } } : {}),
});

const toRecord = ({
  _count,
  ...row
}: TaxonomyTerm & { _count: { contents: number } }): CountedTermRecord => ({
  ...row,
  count: _count.contents,
  seo: fromSeoColumns(row),
  fields: parseFields(row.fields),
});

const toRow = ({ seo, ...record }: TaxonomyTermRecord): TaxonomyTerm => ({
  ...record,
  ...toSeoColumns(seo),
  fields: JSON.stringify(record.fields),
});

/** Links the term to the files among `mediaIds` that exist. */
const linkMedia = async (
  tx: Prisma.TransactionClient,
  termId: string,
  mediaIds: readonly string[],
) => {
  if (!mediaIds.length) return;
  const existing = await tx.media.findMany({
    where: { id: { in: [...new Set(mediaIds)] } },
    select: { id: true },
  });
  if (existing.length)
    await tx.termMedia.createMany({
      data: existing.map(({ id }) => ({ termId, mediaId: id })),
      // A retained link may already point at the same file.
      skipDuplicates: true,
    });
};

export class PrismaTaxonomyRepository implements TaxonomyRepository {
  constructor(
    private readonly db: Database,
    private readonly kick: () => void = () => {},
    private readonly tokens?: PermalinkTokenRegistry,
  ) {}

  async list(
    taxonomy: TaxonomyType,
    scope: TermCountScope,
    filter: TermListFilter = {},
  ) {
    const rows = await this.db.taxonomyTerm.findMany({
      where: matching(taxonomy, scope, filter),
      include: counted(scope),
    });
    return sortTerms(rows.map(toRecord), filter);
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
    return takenSlugs(
      this.db,
      'taxonomy_terms',
      slugs,
      Prisma.sql`AND t.taxonomy = ${taxonomy}`,
    );
  }

  async insert(record: TaxonomyTermRecord, mediaIds: readonly string[] = []) {
    await this.write(async (tx) => {
      await this.checkParent(tx, record);
      await tx.taxonomyTerm.create({ data: toRow(record) });
      await linkMedia(tx, record.id, mediaIds);
    });
  }

  async update(record: TaxonomyTermRecord, media?: TermMediaLinks) {
    await this.write(async (tx) => {
      // The stored taxonomy wins: a term never changes kind.
      const { taxonomy } = await tx.taxonomyTerm.findUniqueOrThrow({
        where: { id: record.id },
        select: { taxonomy: true },
      });
      await this.checkParent(tx, { ...record, taxonomy });
      const { id, ...data } = toRow({ ...record, taxonomy });
      await tx.taxonomyTerm.update({ where: { id }, data });
      if (media) {
        await tx.termMedia.deleteMany({
          where: { termId: id, mediaId: { notIn: [...media.retain] } },
        });
        await linkMedia(tx, id, media.ids);
      }
      await queueContentPaths(
        tx,
        { id: { in: await this.pathIds(tx, id) } },
        this.tokens,
      );
      // A new slug or parent changes what term filters match: rebuild the search index.
      await tx.searchOutbox.create({ data: { contentId: null } });
    });
  }

  async delete(id: string) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const term = await tx.taxonomyTerm.findUnique({ where: { id } });
      if (!term) return [];
      const assignments = await tx.contentTerm.findMany({
        where: { termId: id },
        select: { contentId: true },
      });
      const affected = await this.pathIds(tx, id);
      await tx.taxonomyTerm.updateMany({
        where: { parentId: id },
        data: { parentId: term.parentId },
      });
      // Assignments go with it (ON DELETE CASCADE).
      await tx.taxonomyTerm.delete({ where: { id } });
      await queueContentPaths(tx, { id: { in: affected } }, this.tokens);
      await tx.searchOutbox.create({ data: { contentId: null } });
      return assignments.map(({ contentId }) => contentId);
    });
    this.kick();
    return result;
  }

  private async pathIds(tx: Prisma.TransactionClient, id: string) {
    const terms = await tx.taxonomyTerm.findMany({
      select: { id: true, parentId: true },
    });
    const children = new Map<string, string[]>();
    for (const term of terms) {
      if (!term.parentId) continue;
      const ids = children.get(term.parentId) ?? [];
      ids.push(term.id);
      children.set(term.parentId, ids);
    }
    const ids = new Set<string>();
    const pending = [id];
    while (pending.length) {
      const next = pending.pop()!;
      if (ids.has(next)) continue;
      ids.add(next);
      pending.push(...(children.get(next) ?? []));
    }
    const contents = await tx.content.findMany({
      where: { terms: { some: { termId: { in: [...ids] } } } },
      select: { id: true },
    });
    return contents.map(({ id }) => id);
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
    this.kick();
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
