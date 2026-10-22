import type { ContentDocument, TermSummary, TaxonomyType } from '@cms/sdk';
import type {
  ContentCriteria,
  ContentRecord,
  ContentRepository,
  ContentSummaryRecord,
  ContentWrite,
} from '#api/domain/content/content-repository';
import { checkContentParent } from '#api/domain/content/hierarchy';
import { checkTermKinds } from '#api/domain/content/term-assignment';
import { guardUnique } from '#api/infra/prisma/client';
import {
  parseFields,
  featuredImageOf,
  contentWhere,
  contentRelations as withRelations,
  termSummaries,
} from '#api/infra/prisma/content-criteria';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import type { Content } from '#api/infra/prisma/generated/client';
import { invalidInput, Errors } from '#api/shared/errors';
import { fromSeoColumns, toSeoColumns } from '#api/infra/prisma/seo-mapper';
import {
  assignContentPath,
  refreshContentPaths,
  decodePath,
  lockPermalinks,
} from '#api/infra/prisma/permalink-repository';

type Row = Content & {
  currentPath: { path: Uint8Array } | null;
  author: { name: string; slug: string };
  featuredMedia: Parameters<typeof featuredImageOf>[0];
  terms: { term: TermSummary & { taxonomy: TaxonomyType } }[];
};

const toRecord = (
  {
    document,
    searchText: _searchText,
    terms,
    currentPath,
    author,
    featuredMedia,
    ...row
  }: Row,
  path = currentPath && decodePath(currentPath.path),
): ContentRecord => {
  if (path === null) throw new Error(Errors.ContentPathMissing);
  return {
    ...row,
    authorName: author.name,
    authorSlug: author.slug,
    featuredImage: featuredImageOf(featuredMedia),
    fields: parseFields(row.fields),
    path,
    document: JSON.parse(document) as ContentDocument,
    extraTerms: terms
      .filter(
        ({ term }) => term.taxonomy !== 'category' && term.taxonomy !== 'tag',
      )
      .map(({ term }) => ({
        id: term.id,
        name: term.name,
        slug: term.slug,
        taxonomy: term.taxonomy,
      })),
    categories: termSummaries(terms, 'category'),
    tags: termSummaries(terms, 'tag'),
    seo: fromSeoColumns(row),
  };
};

/** List rows skip the large text columns. */
const listOmit = { document: true, html: true, searchText: true } as const;

const toSummary = ({
  terms,
  currentPath,
  author,
  featuredMedia,
  ...row
}: Omit<Row, keyof typeof listOmit>): ContentSummaryRecord => {
  if (!currentPath) throw new Error(Errors.ContentPathMissing);
  return {
    ...row,
    authorName: author.name,
    authorSlug: author.slug,
    featuredImage: featuredImageOf(featuredMedia),
    fields: parseFields(row.fields),
    path: decodePath(currentPath.path),
    extraTerms: terms
      .filter(
        ({ term }) => term.taxonomy !== 'category' && term.taxonomy !== 'tag',
      )
      .map(({ term }) => ({
        id: term.id,
        name: term.name,
        slug: term.slug,
        taxonomy: term.taxonomy,
      })),
    categories: termSummaries(terms, 'category'),
    tags: termSummaries(terms, 'tag'),
    seo: fromSeoColumns(row),
  };
};

/** The written columns. `trashedAt` is changed only through `setTrashed`. */
const toRow = ({
  document,
  seo,
  extraTermIds: _extraTermIds,
  categoryIds: _categoryIds,
  tagIds: _tagIds,
  mediaIds: _mediaIds,
  ...record
}: ContentWrite): Omit<Content, 'trashedAt' | 'commentCount'> => ({
  ...record,
  parentId: record.parentId ?? null,
  ...toSeoColumns(seo),
  document: JSON.stringify(document),
  fields: JSON.stringify(record.fields),
});

const assignments = ({
  categoryIds,
  tagIds,
  extraTermIds = [],
}: ContentWrite) =>
  [...categoryIds, ...tagIds, ...extraTermIds].map((termId) => ({ termId }));

type Transaction = Prisma.TransactionClient;

export class PrismaContentRepository implements ContentRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string) {
    const row = await this.db.content.findUnique({
      where: { id },
      include: withRelations,
    });
    return row && toRecord(row);
  }

  async takenSlugs(slugs: readonly string[]) {
    const rows = await this.db.content.findMany({
      where: { slug: { in: [...slugs] } },
      select: { slug: true },
    });
    return new Set(rows.map((row) => row.slug));
  }

  async list({ page, pageSize, orderBy, ...filters }: ContentCriteria) {
    // Every filter reaches the query (trash view, author, sticky, dates included).
    const where = await contentWhere(this.db, filters);
    if (!where) return { items: [], total: 0 };
    const total = await this.db.content.count({ where });
    const skip = (page - 1) * pageSize;
    if (skip >= total) return { items: [], total };
    const rows = await this.db.content.findMany({
      where,
      omit: listOmit,
      include: withRelations,
      orderBy: [{ [orderBy]: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
    });
    return { items: rows.map(toSummary), total };
  }

  async exportPage(afterId: string | null, limit: number) {
    const rows = await this.db.content.findMany({
      where: {
        trashedAt: null,
        ...(afterId && { id: { gt: afterId } }),
      },
      include: withRelations,
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map((row) => toRecord(row));
  }

  async insert(record: ContentWrite) {
    return this.write(record, async (tx, next) =>
      tx.content.create({
        data: { ...toRow(next), terms: { create: assignments(next) } },
        include: withRelations,
      }),
    );
  }

  async update(record: ContentWrite) {
    return this.write(record, async (tx, next) => {
      const { id, ...data } = toRow(next);
      return tx.content.update({
        where: { id },
        data: {
          ...data,
          terms: { deleteMany: {}, create: assignments(next) },
        },
        include: withRelations,
      });
    });
  }

  async delete(id: string) {
    await this.db.$transaction(async (tx) => {
      await lockPermalinks(tx);
      // Assignments, current route and redirects go with it (ON DELETE CASCADE).
      await tx.content.deleteMany({ where: { id } });
      await refreshContentPaths(tx, { type: 'page' });
      await tx.searchOutbox.create({ data: { contentId: id } });
    });
  }

  async setTrashed(id: string, at: Date | null) {
    await this.db.$transaction([
      this.db.content.update({ where: { id }, data: { trashedAt: at } }),
      this.db.searchOutbox.create({ data: { contentId: id } }),
    ]);
  }

  async typeInUse(type: string) {
    return (await this.db.content.count({ where: { type }, take: 1 })) > 0;
  }

  async publishDue(now: Date) {
    const due = await this.db.content.findMany({
      where: {
        status: 'scheduled',
        trashedAt: null,
        publishedAt: { lte: now },
      },
      select: { id: true },
      take: 100,
    });
    const published: string[] = [];
    for (const { id } of due) {
      // Conditional per entry: an edit that unscheduled it meanwhile wins.
      const count = await this.db.$transaction(async (tx) => {
        const { count: changed } = await tx.content.updateMany({
          where: { id, status: 'scheduled', publishedAt: { lte: now } },
          data: { status: 'published', updatedAt: now },
        });
        if (changed) await tx.searchOutbox.create({ data: { contentId: id } });
        return changed;
      });
      if (count) published.push(id);
    }
    return published;
  }

  async expiredTrash(before: Date, limit: number) {
    const rows = await this.db.content.findMany({
      where: { trashedAt: { lt: before } },
      select: { id: true },
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  /** Checks the term kinds and saves in one transaction; a term deleted meanwhile fails the FK. */
  private async write(
    record: ContentWrite,
    save: (tx: Transaction, next: ContentWrite) => Promise<Row>,
  ): Promise<ContentRecord> {
    try {
      return await guardUnique(
        () =>
          this.db.$transaction(async (tx) => {
            await lockPermalinks(tx);
            const current = await tx.content.findUnique({
              where: { id: record.id },
              select: { publishedAt: true },
            });
            const next = {
              ...record,
              publishedAt: current?.publishedAt ?? record.publishedAt,
            };
            if (
              record.type !== 'page' &&
              (await tx.content.count({ where: { parentId: record.id } }))
            )
              throw invalidInput(Errors.ContentParentInvalid);
            await checkContentParent(
              {
                id: record.id,
                type: record.type,
                parentId: record.parentId ?? null,
              },
              (id) =>
                tx.content.findUnique({
                  where: { id },
                  select: { id: true, type: true, parentId: true },
                }),
            );
            const terms = await tx.taxonomyTerm.findMany({
              where: {
                id: {
                  in: [
                    ...record.categoryIds,
                    ...record.tagIds,
                    ...(record.extraTermIds ?? []),
                  ],
                },
              },
              select: { id: true, taxonomy: true },
            });
            checkTermKinds(
              record,
              new Map(terms.map((term) => [term.id, term.taxonomy])),
            );
            // Links to media that no longer exists are dropped; a missing featured image is an error.
            const media = new Set(
              (
                await tx.media.findMany({
                  where: { id: { in: record.mediaIds } },
                  select: { id: true },
                })
              ).map((row) => row.id),
            );
            if (record.featuredMediaId && !media.has(record.featuredMediaId))
              throw invalidInput(Errors.MediaNotFound, [
                { path: 'featuredMediaId', message: Errors.MediaNotFound },
              ]);
            const row = await save(tx, next);
            await tx.contentMedia.deleteMany({ where: { contentId: row.id } });
            if (media.size)
              await tx.contentMedia.createMany({
                data: [...media].map((mediaId) => ({
                  contentId: row.id,
                  mediaId,
                })),
              });
            await tx.searchOutbox.create({ data: { contentId: row.id } });
            const path = await assignContentPath(
              tx,
              row,
              current?.publishedAt != null,
            );
            return toRecord(row, path);
          }),
        Errors.SlugConflict,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      )
        throw invalidInput(Errors.UnknownTerms);
      throw error;
    }
  }
}
