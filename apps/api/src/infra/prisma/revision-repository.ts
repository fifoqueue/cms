import type { ContentDocument } from '@cms/sdk';
import type {
  RevisionRecord,
  RevisionRepository,
  RevisionWrite,
  RevisionDeleteGuard,
  RevisionSave,
} from '#api/domain/content/revisions';
import type { Database } from '#api/infra/prisma/client';
import { lockPermalinks } from '#api/infra/prisma/permalink-repository';
import type {
  Content,
  ContentRevision,
} from '#api/infra/prisma/generated/client';
import { checkDeleteGuard } from '#api/infra/prisma/revision-delete-guard';
import { invalidInput, notFound, Errors } from '#api/shared/errors';

type Row = ContentRevision & { author: { name: string } | null };

const toRecord = ({ author, document, ...row }: Row): RevisionRecord => ({
  ...row,
  kind: row.kind as RevisionRecord['kind'],
  authorName: author?.name ?? '',
  document: JSON.parse(document) as ContentDocument,
});

const toRow = ({ document, ...revision }: RevisionWrite) => ({
  ...revision,
  document: JSON.stringify(document),
});

const withAuthor = { author: { select: { name: true } } } as const;

/**
 * The user's autosave newer than the durable text-save watermark.
 * Shared with the content write guard, which runs it inside its locked transaction.
 */
export const pendingIn = async (
  db: Pick<Database, 'contentRevision'>,
  contentId: string,
  authorId: string,
  savedAt: Date,
) => {
  const autosave = await db.contentRevision.findFirst({
    where: { contentId, authorId, kind: 'autosave' },
    include: withAuthor,
  });
  if (!autosave) return null;
  return autosave.createdAt > savedAt ? toRecord(autosave) : null;
};

/** Called only inside the content write transaction, after its locked text comparison. */
export const saveRevisionIn = async (
  tx: Pick<Database, 'contentRevision'>,
  record: Pick<
    Content,
    'id' | 'title' | 'excerpt' | 'document' | 'textSavedAt' | 'updatedAt'
  >,
  revision: RevisionSave,
) => {
  if (record.textSavedAt.getTime() === record.updatedAt.getTime()) {
    await tx.contentRevision.create({
      data: {
        id: revision.id,
        contentId: record.id,
        authorId: revision.authorId,
        ip: revision.ip ?? null,
        userAgent: revision.userAgent ?? null,
        kind: 'revision',
        title: record.title,
        excerpt: record.excerpt,
        document: record.document,
        createdAt: record.textSavedAt,
      },
    });
    const stale = await tx.contentRevision.findMany({
      where: { contentId: record.id, kind: 'revision' },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: revision.keep,
    });
    if (stale.length)
      await tx.contentRevision.deleteMany({
        where: { id: { in: stale.map((row) => row.id) } },
      });
  }
  if (revision.clearAutosave)
    await tx.contentRevision.deleteMany({
      where: {
        contentId: record.id,
        authorId: revision.authorId,
        kind: 'autosave',
        createdAt: { lte: record.updatedAt },
      },
    });
};

export class PrismaRevisionRepository implements RevisionRepository {
  constructor(private readonly db: Database) {}

  async autosave(revision: RevisionWrite) {
    await this.db.$transaction(async (tx) => {
      // Serialized with content writes, so a guarded save sees it or it sees the save.
      await lockPermalinks(tx);
      const saved = await tx.content.findUnique({
        where: { id: revision.contentId },
        select: { updatedAt: true },
      });
      // Dated after the last save even when that save committed while this one waited.
      if (saved && revision.createdAt <= saved.updatedAt)
        revision = {
          ...revision,
          createdAt: new Date(saved.updatedAt.getTime() + 1),
        };
      await tx.contentRevision.deleteMany({
        where: {
          contentId: revision.contentId,
          authorId: revision.authorId,
          kind: 'autosave',
        },
      });
      await tx.contentRevision.create({ data: toRow(revision) });
    });
  }

  async delete(contentId: string, id: string, guard: RevisionDeleteGuard) {
    await this.db.$transaction(async (tx) => {
      await lockPermalinks(tx);
      const current = await tx.content.findUnique({
        where: { id: contentId },
        select: { updatedAt: true, authorId: true, status: true },
      });
      checkDeleteGuard(current, guard);
      const revision = await tx.contentRevision.findFirst({
        where: { id, contentId },
        select: { kind: true },
      });
      if (!revision) throw notFound(Errors.RevisionNotFound);
      if (revision.kind !== 'revision')
        throw invalidInput(Errors.RevisionAutosaveDelete);
      const result = await tx.contentRevision.deleteMany({
        where: { id, contentId, kind: 'revision' },
      });
      if (!result.count) throw notFound(Errors.RevisionNotFound);
    });
  }

  async list(contentId: string) {
    const rows = await this.db.contentRevision.findMany({
      where: { contentId },
      select: {
        id: true,
        contentId: true,
        authorId: true,
        ip: true,
        userAgent: true,
        kind: true,
        title: true,
        createdAt: true,
        ...withAuthor,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(({ author, ...row }) => ({
      ...row,
      kind: row.kind as RevisionRecord['kind'],
      authorName: author?.name ?? '',
    }));
  }

  async get(id: string) {
    const row = await this.db.contentRevision.findUnique({
      where: { id },
      include: withAuthor,
    });
    return row && toRecord(row);
  }

  async pendingAutosave(contentId: string, authorId: string, savedAt: Date) {
    return pendingIn(this.db, contentId, authorId, savedAt);
  }

  async findAutosave(contentId: string, authorId: string) {
    const row = await this.db.contentRevision.findFirst({
      where: { contentId, authorId, kind: 'autosave' },
      include: withAuthor,
    });
    return row && toRecord(row);
  }
}
