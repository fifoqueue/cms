import type { CommentStatus } from '@cms/sdk';
import type {
  CommentChanges,
  CommentCriteria,
  CommentRecord,
  CommentRepository,
  ThreadRecord,
} from '#api/domain/comments/ports';
import type { Database } from '#api/infra/prisma/client';
import { PUBLIC_CONTENT } from '#api/infra/prisma/content-criteria';
import type { Prisma } from '#api/infra/prisma/generated/client';
import { decodePath } from '#api/infra/prisma/permalink-repository';

type Transaction = Prisma.TransactionClient;

const ownColumns = {
  id: true,
  contentId: true,
  parentId: true,
  userId: true,
  authorName: true,
  authorEmail: true,
  authorUrl: true,
  body: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CommentSelect;

/** LIKE pattern text matching `value` literally. */
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const THREAD_ITEMS_MAX = 1000;

/** Applies approved-count changes without rescanning a comment history. */
const adjustCounts = async (
  tx: Transaction,
  deltas: ReadonlyMap<string, number>,
) => {
  for (const [id, delta] of deltas)
    if (delta)
      await tx.content.updateMany({
        where: { id },
        data: { commentCount: { increment: delta } },
      });
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

  async list({ status, contentId, search, page, pageSize }: CommentCriteria) {
    const where: Prisma.CommentWhereInput = {
      status: status ?? { in: ['pending', 'approved'] },
      contentId,
      ...(search && {
        OR: [
          { authorName: { contains: literal(search) } },
          { authorEmail: { contains: literal(search) } },
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

  async update(id: string, changes: CommentChanges, at: Date) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.comment.findUnique({
        where: { id },
        select: ownColumns,
      });
      if (!before) return null;
      const after = await tx.comment.update({
        where: { id },
        data: { ...changes, updatedAt: at },
        select: ownColumns,
      });
      await adjustCounts(
        tx,
        new Map([[after.contentId, statusDelta(before.status, after.status)]]),
      );
      return { before, after };
    });
  }

  async setStatus(ids: readonly string[], status: CommentStatus, at: Date) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.comment.findMany({
        where: { id: { in: [...ids] } },
        select: ownColumns,
      });
      await tx.comment.updateMany({
        where: { id: { in: before.map((row) => row.id) } },
        data: { status, updatedAt: at },
      });
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
    return this.db.$transaction(async (tx) => {
      const doomed = await tx.comment.findMany({
        where: { id: { in: [...ids] } },
        select: ownColumns,
      });
      const deleted = new Set(doomed.map((row) => row.id));
      const parentOf = new Map(doomed.map((row) => [row.id, row.parentId]));
      // Replies move to the nearest ancestor that survives.
      const survivor = (id: string | null): string | null =>
        id && deleted.has(id) ? survivor(parentOf.get(id) ?? null) : id;
      for (const row of doomed)
        await tx.comment.updateMany({
          where: { parentId: row.id, id: { notIn: [...deleted] } },
          data: { parentId: survivor(row.parentId) },
        });
      await tx.comment.deleteMany({ where: { id: { in: [...deleted] } } });
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
    if (rows.length) await this.delete(rows.map((row) => row.id));
    return rows.length;
  }
}
