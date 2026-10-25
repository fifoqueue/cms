import type { CommentStatus } from '@cms/sdk';
import type {
  CommentChanges,
  CommentCriteria,
  CommentRecord,
  CommentRepository,
  ThreadRecord,
} from '#api/domain/comments/ports';
import { lockSetting } from '#api/infra/prisma/client';
import { unauthorized } from '#api/shared/errors';
import type { Database } from '#api/infra/prisma/client';
import { PUBLIC_CONTENT } from '#api/infra/prisma/content-criteria';
import { Prisma } from '#api/infra/prisma/generated/client';
import { decodePath } from '#api/infra/prisma/permalink-repository';

type Transaction = Prisma.TransactionClient;

/** Exclusive locks on entries, in id order, before their comments change. */
const lockEntries = async (tx: Transaction, ids: Iterable<string>) => {
  const unique = [...new Set(ids)];
  if (unique.length)
    await tx.$queryRaw`SELECT id FROM contents WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`;
};

/**
 * The comments of `ids`, locked in id order (`FOR UPDATE`). Every comment writer locks in one
 * order, entry before comment, as deleting an entry does (its row, then the comments through
 * `ON DELETE CASCADE`): moderation (`PrismaCommentRepository.moderate`), inserts and the
 * notification claim lock the entry first. Holding the entry exclusively also matters because
 * changing a comment's indexed columns makes InnoDB check the `content_id` foreign key with a
 * shared lock on the entry, which two writers would each try to upgrade for the count update.
 */
const lockComments = async (
  tx: Transaction,
  ids: readonly string[],
): Promise<CommentRecord[]> =>
  ids.length
    ? tx.$queryRaw<CommentRecord[]>(Prisma.sql`
        SELECT id, content_id AS contentId, parent_id AS parentId, user_id AS userId,
          author_name AS authorName, author_email AS authorEmail, author_url AS authorUrl,
          author_ip AS authorIp, author_user_agent AS authorUserAgent, body, status, created_at AS createdAt, updated_at AS updatedAt
        FROM comments WHERE id IN (${Prisma.join([...new Set(ids)])})
        ORDER BY id FOR UPDATE
      `)
    : Promise.resolve([]);

const ownColumns = {
  id: true,
  contentId: true,
  parentId: true,
  userId: true,
  authorName: true,
  authorEmail: true,
  authorUrl: true,
  authorIp: true,
  authorUserAgent: true,
  body: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CommentSelect;

/** LIKE pattern text matching `value` literally. */
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const THREAD_ITEMS_MAX = 1000;

/**
 * Applies approved-count changes without rescanning a comment history: plain increments on
 * entries the caller already locked.
 */
const adjustCounts = async (
  tx: Transaction,
  deltas: ReadonlyMap<string, number>,
) => {
  for (const [id, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b)))
    if (delta)
      await tx.$executeRaw`UPDATE contents SET comment_count = comment_count + ${delta} WHERE id = ${id}`;
};

const statusDelta = (before: CommentStatus, after: CommentStatus) =>
  Number(after === 'approved') - Number(before === 'approved');

export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly db: Database) {}

  async target(contentId: string) {
    const row = await this.db.content.findFirst({
      where: { id: contentId, ...PUBLIC_CONTENT },
      select: {
        id: true,
        type: true,
        title: true,
        publishedAt: true,
        allowComments: true,
        passwordHash: true,
        authorId: true,
        commentCount: true,
        currentPath: { select: { path: true } },
      },
    });
    if (!row?.currentPath) return null;
    const { currentPath, passwordHash, ...target } = row;
    return {
      ...target,
      protected: passwordHash !== null,
      path: decodePath(currentPath.path),
    };
  }

  findById(id: string) {
    return this.db.comment.findUnique({ where: { id }, select: ownColumns });
  }

  async pageOf(root: CommentRecord, pageSize: number) {
    const before = await this.db.comment.count({
      where: {
        contentId: root.contentId,
        status: 'approved',
        parentId: null,
        OR: [
          { createdAt: { lt: root.createdAt } },
          { createdAt: root.createdAt, id: { lt: root.id } },
        ],
      },
    });
    return Math.floor(before / pageSize) + 1;
  }

  async insert(record: CommentRecord) {
    await this.db.$transaction(async (tx) => {
      await lockSetting(tx, 'privacy.jobs');
      // Before any plain read, like the moderation writes (see `lockComments`).
      await lockEntries(tx, [record.contentId]);
      if (record.userId) {
        const user = await tx.user.findUnique({
          where: { id: record.userId },
          select: { email: true },
        });
        if (
          !user ||
          user.email.toLowerCase() !== record.authorEmail.toLowerCase()
        )
          throw unauthorized();
      }
      await tx.comment.create({ data: record });
      if (record.status === 'approved')
        await adjustCounts(tx, new Map([[record.contentId, 1]]));
    });
  }

  async thread(
    contentId: string,
    page: number,
    pageSize: number,
    depth: number,
  ) {
    const approved = { contentId, status: 'approved' } as const;
    const [roots, total] = await this.db.$transaction([
      this.db.comment.findMany({
        where: { ...approved, parentId: null },
        select: ownColumns,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.comment.count({ where: { ...approved, parentId: null } }),
    ]);
    // One query per reply level, so a page costs at most `depth` reads.
    const children = new Map<string, CommentRecord[]>();
    let parents = roots.map((root) => root.id);
    let remaining = THREAD_ITEMS_MAX - roots.length;
    let truncated = false;
    for (let level = 1; level < depth && parents.length; level += 1) {
      const found = await this.db.comment.findMany({
        where: { ...approved, parentId: { in: parents } },
        select: ownColumns,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: remaining + 1,
      });
      if (found.length > remaining) truncated = true;
      const replies = found.slice(0, remaining);
      for (const reply of replies) {
        const siblings = children.get(reply.parentId!) ?? [];
        siblings.push(reply);
        children.set(reply.parentId!, siblings);
      }
      remaining -= replies.length;
      parents = replies.map((reply) => reply.id);
      if (remaining === 0) break;
    }
    const items: ThreadRecord[] = [];
    const visit = (comment: CommentRecord, level: number) => {
      items.push({ ...comment, depth: level });
      for (const reply of children.get(comment.id) ?? [])
        visit(reply, level + 1);
    };
    for (const root of roots) visit(root, 0);
    return { items, total, truncated };
  }

  async list({
    status,
    contentId,
    ids,
    search,
    page,
    pageSize,
  }: CommentCriteria) {
    const where: Prisma.CommentWhereInput = {
      status: status ?? { in: ['pending', 'approved'] },
      contentId,
      ...(ids && { id: { in: [...ids] } }),
      ...(search && {
        OR: [
          { authorName: { contains: literal(search) } },
          { authorEmail: { contains: literal(search) } },
          { authorIp: { contains: literal(search) } },
          { body: { contains: literal(search) } },
        ],
      }),
    };
    const total = await this.db.comment.count({ where });
    const skip = (page - 1) * pageSize;
    if (skip >= total) return { items: [], total };
    const rows = await this.db.comment.findMany({
      where,
      select: {
        ...ownColumns,
        content: { select: { title: true } },
        parent: { select: { authorName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
    });
    return {
      items: rows.map(({ content, parent, ...row }) => ({
        ...row,
        contentTitle: content.title,
        parentAuthor: parent?.authorName ?? null,
      })),
      total,
    };
  }

  exportPage(contentId: string, afterId: string | null, limit: number) {
    return this.db.comment.findMany({
      where: { contentId, ...(afterId && { id: { gt: afterId } }) },
      select: ownColumns,
      orderBy: { id: 'asc' },
      take: limit,
    });
  }

  async counts() {
    const rows = await this.db.comment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts: Record<CommentStatus, number> = {
      pending: 0,
      approved: 0,
      spam: 0,
      trash: 0,
    };
    for (const row of rows) counts[row.status] = row._count._all;
    return counts;
  }

  /**
   * Runs a moderation write on the comments of `ids` with every lock taken up front, entries
   * then comments (see `lockComments`), so `write` uses plain statements only. A comment's entry
   * never changes, so it is read before the transaction: inside it only locking reads run, which
   * open no snapshot, so no write can fail MariaDB's snapshot isolation check (error 1020) when
   * a concurrent writer (such as the notification claim) committed first.
   */
  private async moderate<T>(
    ids: readonly string[],
    write: (tx: Transaction, rows: CommentRecord[]) => Promise<T>,
  ) {
    const unique = [...new Set(ids)];
    const entries = unique.length
      ? (
          await this.db.comment.findMany({
            where: { id: { in: unique } },
            select: { contentId: true },
          })
        ).map((row) => row.contentId)
      : [];
    return this.db.$transaction(async (tx) => {
      await lockEntries(tx, entries);
      const rows = await lockComments(tx, unique);
      // Comments created after the read above (none in practice: ids are generated) lock late.
      await lockEntries(
        tx,
        rows
          .map((row) => row.contentId)
          .filter((entry) => !entries.includes(entry)),
      );
      return write(tx, rows);
    });
  }

  async update(id: string, changes: CommentChanges, at: Date) {
    return this.moderate([id], async (tx, [before]) => {
      if (!before) return null;
      const after: CommentRecord = {
        ...before,
        ...Object.fromEntries(
          Object.entries(changes).filter(([, value]) => value !== undefined),
        ),
        updatedAt: at,
      };
      await tx.$executeRaw`
        UPDATE comments SET status = ${after.status}, author_name = ${after.authorName},
          author_email = ${after.authorEmail}, author_url = ${after.authorUrl},
          body = ${after.body}, updated_at = ${at}
        WHERE id = ${id}`;
      await adjustCounts(
        tx,
        new Map([[after.contentId, statusDelta(before.status, after.status)]]),
      );
      return { before, after };
    });
  }

  async setStatus(ids: readonly string[], status: CommentStatus, at: Date) {
    return this.moderate(ids, async (tx, before) => {
      if (before.length)
        await tx.$executeRaw`UPDATE comments SET status = ${status}, updated_at = ${at} WHERE id IN (${Prisma.join(before.map((row) => row.id))})`;
      const deltas = new Map<string, number>();
      for (const row of before)
        deltas.set(
          row.contentId,
          (deltas.get(row.contentId) ?? 0) + statusDelta(row.status, status),
        );
      await adjustCounts(tx, deltas);
      return before;
    });
  }

  async delete(ids: readonly string[]) {
    return this.moderate(ids, async (tx, doomed) => {
      if (!doomed.length) return [];
      const deleted = new Set(doomed.map((row) => row.id));
      const doomedIds = Prisma.join([...deleted]);
      const parentOf = new Map(doomed.map((row) => [row.id, row.parentId]));
      // Replies move to the nearest ancestor that survives.
      const survivor = (id: string | null): string | null =>
        id && deleted.has(id) ? survivor(parentOf.get(id) ?? null) : id;
      for (const row of doomed)
        await tx.$executeRaw`UPDATE comments SET parent_id = ${survivor(row.parentId)} WHERE parent_id = ${row.id} AND id NOT IN (${doomedIds})`;
      await tx.$executeRaw`DELETE FROM comments WHERE id IN (${doomedIds})`;
      const deltas = new Map<string, number>();
      for (const row of doomed)
        if (row.status === 'approved')
          deltas.set(row.contentId, (deltas.get(row.contentId) ?? 0) - 1);
      await adjustCounts(tx, deltas);
      return doomed;
    });
  }

  async hasApproved(email: string) {
    return (
      (await this.db.comment.count({
        where: { authorEmail: email, status: 'approved' },
        take: 1,
      })) > 0
    );
  }

  async feed(limit: number, contentId?: string) {
    const rows = await this.db.comment.findMany({
      where: {
        contentId,
        status: 'approved',
        content: { ...PUBLIC_CONTENT, passwordHash: null },
      },
      select: {
        id: true,
        contentId: true,
        authorName: true,
        body: true,
        createdAt: true,
        content: {
          select: { title: true, currentPath: { select: { path: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.flatMap(({ content, ...row }) =>
      content.currentPath
        ? [
            {
              ...row,
              title: content.title,
              path: decodePath(content.currentPath.path),
            },
          ]
        : [],
    );
  }

  async recent(limit: number) {
    const rows = await this.db.comment.findMany({
      where: {
        status: 'approved',
        content: { ...PUBLIC_CONTENT, passwordHash: null },
      },
      select: {
        authorName: true,
        content: {
          select: { title: true, currentPath: { select: { path: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.flatMap(({ authorName, content }) =>
      content.currentPath
        ? [
            {
              author: authorName,
              title: content.title,
              path: decodePath(content.currentPath.path),
            },
          ]
        : [],
    );
  }

  async purge(before: Date, limit: number) {
    const rows = await this.db.comment.findMany({
      where: { status: { in: ['spam', 'trash'] }, updatedAt: { lt: before } },
      select: { id: true },
      take: limit,
    });
    return rows.length ? this.delete(rows.map((row) => row.id)) : [];
  }
}
