import type { ContentDocument, TermSummary, TaxonomyType } from '@cms/sdk';
import { extraTerms } from '#api/infra/prisma/extra-terms';
import type {
  ContentCriteria,
  ContentRecord,
  ContentRepository,
  ContentSummaryRecord,
  ContentWrite,
  ContentWriteGuard,
} from '#api/domain/content/content-repository';
import { checkContentParent } from '#api/domain/content/hierarchy';
import { checkTermKinds } from '#api/domain/content/term-assignment';
import { guardUnique } from '#api/infra/prisma/client';
import {
  pendingIn,
  saveRevisionIn,
} from '#api/infra/prisma/revision-repository';
import type { RevisionSave } from '#api/domain/content/revisions';
import {
  parseFields,
  featuredImageOf,
  contentWhere,
  contentRelations as withRelations,
  termSummaries,
} from '#api/infra/prisma/content-criteria';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { takenSlugs } from '#api/infra/prisma/taken-slugs';
import type { Content } from '#api/infra/prisma/generated/client';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
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
    extraTerms: extraTerms(terms),
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
    extraTerms: extraTerms(terms),
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
}: ContentWrite): Omit<
  Content,
  'trashedAt' | 'commentCount' | 'textSavedAt'
> => ({
  ...record,
  parentId: record.parentId ?? null,
  menuOrder: record.menuOrder ?? 0,
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
    return takenSlugs(this.db, 'contents', slugs);
  }

  async counts(type?: string) {
    const rows = await this.db.$queryRaw<
      { status: string; trash: number; total: bigint }[]
    >(
      Prisma.sql`SELECT status, (trashed_at IS NOT NULL) AS trash, COUNT(*) AS total FROM contents ${type ? Prisma.sql`WHERE type = ${type}` : Prisma.empty} GROUP BY status, (trashed_at IS NOT NULL)`,
    );
    const result = {
      all: 0,
      trash: 0,
      draft: 0,
      pending: 0,
      scheduled: 0,
      published: 0,
      private: 0,
    };
    for (const row of rows) {
      const total = Number(row.total);
      if (Number(row.trash)) result.trash += total;
      else {
        result.all += total;
        result[row.status as 'draft'] += total;
      }
    }
    return result;
  }

  async list({
    page,
    pageSize,
    orderBy,
    order = 'desc',
    ...filters
  }: ContentCriteria) {
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
      // Allowlisted columns only (the SDK enum); id keeps pages stable on ties.
      orderBy: [
        orderBy === 'author'
          ? { author: { name: order } }
          : { [orderBy]: order },
        { id: order },
      ],
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

  async insert(record: ContentWrite, revision: RevisionSave) {
    return this.write(record, revision, async (tx, next) =>
      tx.content.create({
        data: {
          ...toRow(next),
          textSavedAt: next.updatedAt,
          terms: { create: assignments(next) },
        },
        include: withRelations,
      }),
    );
  }

  async update(
    record: ContentWrite,
    revision: RevisionSave,
    guard: ContentWriteGuard = {},
  ) {
    return this.write(record, revision, async (tx, next, current) => {
      if (
        guard.expectedUpdatedAt &&
        current?.updatedAt.getTime() !== guard.expectedUpdatedAt.getTime()
      )
        throw conflict(Errors.ContentChanged);
      if (guard.revision) {
        if (
          current?.authorId !== guard.revision.authorId ||
          current?.status !== guard.revision.status
        )
          throw conflict(Errors.ContentChanged);
        if (
          !(await tx.contentRevision.count({
            where: {
              id: guard.revision.id,
              contentId: record.id,
              kind: { in: ['revision', 'autosave'] },
            },
          }))
        )
          throw notFound(Errors.RevisionNotFound);
      }
      // Autosaves are written under the same lock, so none can appear before this write commits.
      if (
        guard.autosaveOf &&
        current &&
        (await pendingIn(tx, record.id, guard.autosaveOf, current.textSavedAt))
      )
        throw conflict(Errors.ContentAutosavePending);
      const { id, ...data } = toRow(next);
      return tx.content.update({
        where: { id },
        data: {
          ...data,
          textSavedAt:
            current &&
            current.title === next.title &&
            current.excerpt === next.excerpt &&
            current.document === JSON.stringify(next.document)
              ? current.textSavedAt
              : next.updatedAt,
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
      // Under the content write lock, rechecked there: an edit that unscheduled it meanwhile
      // wins, and the version still strictly advances (no reuse of an earlier `updatedAt`).
      const changed = await this.db.$transaction(async (tx) => {
        await lockPermalinks(tx);
        const current = await tx.content.findUnique({
          where: { id },
          select: {
            status: true,
            publishedAt: true,
            trashedAt: true,
            updatedAt: true,
          },
        });
        if (
          current?.status !== 'scheduled' ||
          current.trashedAt ||
          !current.publishedAt ||
          current.publishedAt > now
        )
          return false;
        await tx.content.update({
          where: { id },
          data: {
            status: 'published',
            updatedAt:
              now > current.updatedAt
                ? now
                : new Date(current.updatedAt.getTime() + 1),
          },
        });
        await tx.searchOutbox.create({ data: { contentId: id } });
        return true;
      });
      if (changed) published.push(id);
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
    revision: RevisionSave,
    save: (
      tx: Transaction,
      next: ContentWrite,
      current: Pick<
        Content,
        | 'publishedAt'
        | 'updatedAt'
        | 'textSavedAt'
        | 'authorId'
        | 'status'
        | 'title'
        | 'excerpt'
        | 'document'
      > | null,
    ) => Promise<Row>,
  ): Promise<ContentRecord> {
    try {
      return await guardUnique(
        () =>
          this.db.$transaction(async (tx) => {
            await lockPermalinks(tx);
            const current = await tx.content.findUnique({
              where: { id: record.id },
              select: {
                publishedAt: true,
                updatedAt: true,
                textSavedAt: true,
                authorId: true,
                status: true,
                title: true,
                excerpt: true,
                document: true,
              },
            });
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
            // The version (`updatedAt`) strictly advances, so equal clocks never share one.
            const next =
              current && record.updatedAt <= current.updatedAt
                ? {
                    ...record,
                    updatedAt: new Date(current.updatedAt.getTime() + 1),
                  }
                : record;
            const row = await save(tx, next, current);
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
            await saveRevisionIn(tx, row, revision);
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
