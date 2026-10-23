import type { CommentStatus } from '@cms/sdk';
import type {
  CommentChanges,
  CommentCriteria,
  CommentRecord,
  CommentRepository,
  ThreadRecord,
} from '#api/domain/comments/ports';
import type { MemoryContentRepository } from '#test/support/memory';

const byDate = (a: CommentRecord, b: CommentRecord) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/** Same contract as `PrismaCommentRepository`, keeping the entries' approved counts. */
export class MemoryCommentRepository implements CommentRepository {
  readonly rows = new Map<string, CommentRecord>();

  constructor(private readonly content: MemoryContentRepository) {}

  async target(contentId: string) {
    const entry = await this.content.findById(contentId);
    if (!entry || entry.status !== 'published' || entry.trashedAt) return null;
    return {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      path: entry.path,
      publishedAt: entry.publishedAt,
      allowComments: entry.allowComments,
      protected: entry.passwordHash !== null,
      authorId: entry.authorId,
      commentCount: entry.commentCount,
    };
  }

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async pageOf(root: CommentRecord, pageSize: number) {
    const before = [...this.rows.values()].filter(
      (row) =>
        row.contentId === root.contentId &&
        row.status === 'approved' &&
        row.parentId === null &&
        byDate(row, root) < 0,
    ).length;
    return Math.floor(before / pageSize) + 1;
  }

  async insert(record: CommentRecord) {
    this.rows.set(record.id, { ...record });
    this.recount([record.contentId]);
  }

  async thread(
    contentId: string,
    page: number,
    pageSize: number,
    depth: number,
  ) {
    const approved = [...this.rows.values()]
      .filter((row) => row.contentId === contentId && row.status === 'approved')
      .sort(byDate);
    const roots = approved.filter((row) => row.parentId === null);
    const items: ThreadRecord[] = [];
    let truncated = false;
    const visit = (comment: CommentRecord, level: number) => {
      if (items.length === 1000) {
        truncated = true;
        return;
      }
      items.push({ ...comment, depth: level });
      if (level + 1 < depth)
        for (const reply of approved.filter(
          (row) => row.parentId === comment.id,
        ))
          visit(reply, level + 1);
    };
    for (const root of roots.slice((page - 1) * pageSize, page * pageSize))
      visit(root, 0);
    return { items, total: roots.length, truncated };
  }

  async list({ status, contentId, search, page, pageSize }: CommentCriteria) {
    const needle = search?.toLowerCase();
    const matches = [...this.rows.values()]
      .filter(
        (row) =>
          (status
            ? row.status === status
            : row.status === 'pending' || row.status === 'approved') &&
          (!contentId || row.contentId === contentId) &&
          (!needle ||
            [row.authorName, row.authorEmail, row.body].some((text) =>
              text.toLowerCase().includes(needle),
            )),
      )
      .sort((a, b) => byDate(b, a));
    const items = await Promise.all(
      matches
        .slice((page - 1) * pageSize, page * pageSize)
        .map(async (row) => ({
          ...row,
          parentAuthor: row.parentId
            ? (this.rows.get(row.parentId)?.authorName ?? null)
            : null,
          contentTitle:
            (await this.content.findById(row.contentId))?.title ?? '',
        })),
    );
    return { items, total: matches.length };
  }

  async exportPage(contentId: string, afterId: string | null, limit: number) {
    return [...this.rows.values()]
      .filter(
        (row) => row.contentId === contentId && (!afterId || row.id > afterId),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async counts() {
    const counts: Record<CommentStatus, number> = {
      pending: 0,
      approved: 0,
      spam: 0,
      trash: 0,
    };
    for (const row of this.rows.values()) counts[row.status] += 1;
    return counts;
  }

  async update(id: string, changes: CommentChanges, at: Date) {
    const before = this.rows.get(id);
    if (!before) return null;
    const after = { ...before, ...changes, updatedAt: at };
    this.rows.set(id, after);
    this.recount([before.contentId]);
    return { before: { ...before }, after: { ...after } };
  }

  async setStatus(ids: readonly string[], status: CommentStatus, at: Date) {
    const before = ids.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [{ ...row }] : [];
    });
    for (const row of before)
      this.rows.set(row.id, { ...row, status, updatedAt: at });
    this.recount(before.map((row) => row.contentId));
    return before;
  }

  async delete(ids: readonly string[]) {
    const doomed = ids.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [row] : [];
    });
    const deleted = new Set(doomed.map((row) => row.id));
    const survivor = (id: string | null): string | null =>
      id && deleted.has(id) ? survivor(this.rows.get(id)!.parentId) : id;
    for (const row of this.rows.values())
      if (!deleted.has(row.id) && row.parentId && deleted.has(row.parentId))
        row.parentId = survivor(row.parentId);
    for (const id of deleted) this.rows.delete(id);
    this.recount(doomed.map((row) => row.contentId));
    return doomed;
  }

  async hasApproved(email: string) {
    return [...this.rows.values()].some(
      (row) => row.authorEmail === email && row.status === 'approved',
    );
  }

  async recent(limit: number) {
    const rows = [...this.rows.values()]
      .filter((row) => row.status === 'approved')
      .sort((a, b) => byDate(b, a));
    const result: { author: string; title: string; path: string }[] = [];
    for (const row of rows) {
      const target = await this.target(row.contentId);
      if (target && !target.protected)
        result.push({
          author: row.authorName,
          title: target.title,
          path: target.path,
        });
      if (result.length === limit) break;
    }
    return result;
  }

  async purge(before: Date, limit: number) {
    const ids = [...this.rows.values()]
      .filter(
        (row) =>
          (row.status === 'spam' || row.status === 'trash') &&
          row.updatedAt < before,
      )
      .slice(0, limit)
      .map((row) => row.id);
    await this.delete(ids);
    return ids.length;
  }

  private recount(contentIds: readonly string[]) {
    for (const id of new Set(contentIds))
      this.content.commentCounts.set(
        id,
        [...this.rows.values()].filter(
          (row) => row.contentId === id && row.status === 'approved',
        ).length,
      );
  }
}
