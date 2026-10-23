import type { ContentDocument } from '@cms/sdk';
import type {
  RevisionRecord,
  RevisionRepository,
  RevisionWrite,
} from '#api/domain/content/revisions';
import type { Database } from '#api/infra/prisma/client';
import { lockPermalinks } from '#api/infra/prisma/permalink-repository';
import type { ContentRevision } from '#api/infra/prisma/generated/client';

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
 * The user's autosave newer than the entry's last text save (newest revision, else `savedAt`).
 * Shared with the content write guard, which runs it inside its locked transaction.
 */
export const pendingIn = async (
  db: Pick<Database, 'contentRevision'>,
  contentId: string,
  authorId: string,
  savedAt: Date,
) => {
  // Sequential: inside an interactive transaction the queries share one connection.
  const autosave = await db.contentRevision.findFirst({
    where: { contentId, authorId, kind: 'autosave' },
    include: withAuthor,
  });
  if (!autosave) return null;
  const latest = await db.contentRevision.findFirst({
    where: { contentId, kind: 'revision' },
    select: { createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const baseline = latest?.createdAt ?? savedAt;
  return autosave.createdAt > baseline ? toRecord(autosave) : null;
};

export class PrismaRevisionRepository implements RevisionRepository {
  constructor(private readonly db: Database) {}

  async add(revision: RevisionWrite, keep: number) {
    await this.db.$transaction(async (tx) => {
      await tx.contentRevision.create({ data: toRow(revision) });
      const stale = await tx.contentRevision.findMany({
        where: { contentId: revision.contentId, kind: 'revision' },
        select: { id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: keep,
      });
      if (stale.length)
        await tx.contentRevision.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
    });
  }

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

  async clearAutosave(contentId: string, authorId: string) {
    await this.db.contentRevision.deleteMany({
      where: { contentId, authorId, kind: 'autosave' },
    });
  }

  async list(contentId: string) {
    const rows = await this.db.contentRevision.findMany({
      where: { contentId },
      select: {
        id: true,
        contentId: true,
        authorId: true,
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
