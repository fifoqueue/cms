import type {
  CommentNoticeState,
  NoticeItem,
  NoticeOutbox,
  PushInvalidReason,
  PushKeys,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  QueuedJob,
} from '#api/domain/comments/notification-ports';
import { countNotice } from '#api/domain/comments/notice-window';
import type { NoticeWindow } from '#api/domain/comments/notice-window';
import { sameAuth } from '#api/infra/push-auth';
import type { MemoryCommentRepository } from '#test/support/memory-comments';
import type { MemoryJobQueue } from '#test/support/memory-jobs';

/** Same contract as `PrismaPushSubscriptionRepository`. */
export class MemoryPushSubscriptions implements PushSubscriptionRepository {
  readonly rows = new Map<string, PushSubscriptionRecord>();

  async save(record: PushSubscriptionRecord, cap: number) {
    const sameOwner = (row: PushSubscriptionRecord) =>
      record.commentId
        ? row.commentId === record.commentId
        : row.userId === record.userId;
    const existing = [...this.rows.values()].find(
      (row) => sameOwner(row) && row.endpoint === record.endpoint,
    );
    this.rows.set(
      existing?.id ?? record.id,
      existing
        ? { ...existing, ...this.refreshed(record, record.lastSeenAt) }
        : { ...record },
    );
    const owned = [...this.rows.values()]
      .filter(sameOwner)
      .sort(
        (a, b) =>
          b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
          b.id.localeCompare(a.id),
      );
    for (const row of owned.slice(cap)) this.rows.delete(row.id);
  }

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async active(owner: { commentId?: string | null; userId?: string | null }) {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.status === 'active' &&
          ((!!owner.commentId && row.commentId === owner.commentId) ||
            (!!owner.userId && row.userId === owner.userId)),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => ({ ...row }));
  }

  async renew(
    old: { endpoint: string; auth: string },
    next: PushKeys,
    at: Date,
  ) {
    const moved = [...this.rows.values()].filter(
      (row) =>
        row.status === 'active' &&
        row.endpoint === old.endpoint &&
        sameAuth(row.auth, old.auth),
    );
    for (const row of moved) {
      const duplicate =
        next.endpoint === old.endpoint
          ? undefined
          : [...this.rows.values()].find(
              (other) =>
                other.endpoint === next.endpoint &&
                (row.commentId
                  ? other.commentId === row.commentId
                  : other.userId === row.userId),
            );
      if (duplicate) this.rows.delete(row.id);
      const target = duplicate ?? row;
      this.rows.set(target.id, { ...target, ...this.refreshed(next, at) });
    }
    return moved.length;
  }

  async removeForUser(userId: string, endpoint: string) {
    for (const row of [...this.rows.values()])
      if (row.userId === userId && row.endpoint === endpoint)
        this.rows.delete(row.id);
  }

  async delete(id: string) {
    this.rows.delete(id);
  }

  async invalidate(
    ids: readonly string[],
    reason: PushInvalidReason,
    at: Date,
  ) {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row?.status === 'active')
        this.rows.set(id, {
          ...row,
          status: 'invalid',
          invalidReason: reason,
          invalidatedAt: at,
        });
    }
  }

  async page(afterId: string | null, limit: number) {
    return [...this.rows.values()]
      .filter(
        (row) => row.status === 'active' && (!afterId || row.id > afterId),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async purge(before: Date) {
    let count = 0;
    for (const row of [...this.rows.values()])
      if (
        row.status === 'invalid' &&
        row.invalidatedAt &&
        row.invalidatedAt < before
      ) {
        this.rows.delete(row.id);
        count += 1;
      }
    return count;
  }

  private refreshed(keys: PushKeys, at: Date) {
    return {
      endpoint: keys.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      expiresAt: keys.expiresAt,
      status: 'active' as const,
      invalidReason: null,
      invalidatedAt: null,
      lastSeenAt: at,
    };
  }
}

/** Same contract as `PrismaCommentNoticeState`. */
export class MemoryCommentNoticeState implements CommentNoticeState {
  readonly claimed = new Set<string>();
  readonly muted = new Set<string>();

  /** Transactions that fail (before changing anything) next, to test retries. */
  failures = 0;

  constructor(
    private readonly comments: MemoryCommentRepository,
    private readonly queue: MemoryJobQueue,
  ) {}

  async claim(comment: { id: string }, _at: Date, job: QueuedJob) {
    const commentId = comment.id;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('claim failed');
    }
    const row = this.comments.rows.get(commentId);
    if (
      !row ||
      row.status !== 'approved' ||
      !row.body ||
      this.claimed.has(commentId)
    )
      return false;
    this.claimed.add(commentId);
    enqueue(this.queue, job);
    return true;
  }

  async release(commentId: string) {
    const row = this.comments.rows.get(commentId);
    if (!row || row.status === 'approved') return false;
    this.claimed.delete(commentId);
    return true;
  }

  async replyMail(commentId: string) {
    return !this.muted.has(commentId);
  }

  async muteReplyMail(commentId: string) {
    this.muted.add(commentId);
  }
}

/**
 * Queues synchronously: `MemoryJobQueue.enqueue` has no await before it writes, so a batch of
 * calls cannot interleave with another transaction (the memory stand-in for atomicity).
 */
const enqueue = (queue: MemoryJobQueue, job: QueuedJob) =>
  void queue.enqueue(job.kind, job.payload, job.runAt, job.expiresAt);

/** Same contract as `PrismaNoticeOutbox`. */
export class MemoryNoticeOutbox implements NoticeOutbox {
  readonly windows = new Map<string, NoticeWindow>();
  readonly dispatched = new Map<string, Date>();
  /** Subjects (comment/user ids) personal-data erasure has erased; tests add to it. */
  readonly erased = new Set<string>();
  /** Transactions that fail (before changing anything) next, to test retries. */
  failures = 0;

  constructor(private readonly queue: MemoryJobQueue) {}

  private live(subjects: readonly string[]) {
    return !subjects.some((subject) => this.erased.has(subject));
  }

  async dispatch(
    key: string,
    now: Date,
    plan: { jobs?: QueuedJob[]; items?: NoticeItem[] },
  ) {
    this.fail();
    if (this.dispatched.has(key)) return false;
    // Decide everything first, then write, so a throwing builder changes nothing.
    const windows = new Map(this.windows);
    const jobs = [...(plan.jobs ?? [])];
    const count = (key: string, limit: number, windowMs: number) => {
      const result = countNotice(
        windows.get(key) ?? null,
        limit,
        windowMs,
        now,
      );
      windows.set(key, result.next);
      return result;
    };
    for (const item of plan.items ?? []) {
      if (!this.live(item.subjects)) continue;
      const { window, thread } = item;
      const flood = count(window.key, window.limit, window.windowMs);
      if (flood.admitted)
        jobs.push(
          ...item.deliver(
            thread
              ? count(thread.key, Number.MAX_SAFE_INTEGER, thread.windowMs)
                  .position - 1
              : 0,
          ),
        );
      else if (flood.firstHeld) jobs.push(item.collect(flood.next.windowEnd));
    }
    this.dispatched.set(key, now);
    for (const [windowKey, value] of windows)
      this.windows.set(windowKey, value);
    for (const job of jobs)
      if (this.live(job.subjects)) enqueue(this.queue, job);
    return true;
  }

  async collect(window: string, build: (count: number) => QueuedJob[]) {
    this.fail();
    const row = this.windows.get(window);
    if (!row?.deferred) return 0;
    const jobs = build(row.deferred);
    const held = row.deferred;
    this.windows.set(window, { ...row, deferred: 0 });
    for (const job of jobs)
      if (this.live(job.subjects)) enqueue(this.queue, job);
    return held;
  }

  async purge(before: Date) {
    for (const [key, row] of this.windows)
      if (row.windowEnd < before && !row.deferred) this.windows.delete(key);
    for (const [key, at] of this.dispatched)
      if (at < before) this.dispatched.delete(key);
  }

  private fail() {
    if (this.failures <= 0) return;
    this.failures -= 1;
    throw new Error('outbox transaction failed');
  }
}
