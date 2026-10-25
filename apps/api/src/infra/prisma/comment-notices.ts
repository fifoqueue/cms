import { createHash } from 'node:crypto';
import type {
  CommentNoticeState,
  NoticeItem,
  NoticeOutbox,
  QueuedJob,
} from '#api/domain/comments/notification-ports';
import { countNotice } from '#api/domain/comments/notice-window';
import type { IdGenerator } from '#api/domain/ports';
import type { Database } from '#api/infra/prisma/client';
import { lockSetting } from '#api/infra/prisma/client';
import { erasedSubjects, insertJob } from '#api/infra/prisma/job-queue';
import type { Prisma } from '#api/infra/prisma/generated/client';

/** Job rows are written under the lock personal-data erasure scans them with. */
const JOBS_LOCK = 'privacy.jobs';

export class PrismaCommentNoticeState implements CommentNoticeState {
  constructor(
    private readonly db: Database,
    private readonly ids: IdGenerator,
  ) {}

  claim(comment: { id: string; contentId: string }, at: Date, job: QueuedJob) {
    return this.db.$transaction(async (tx) => {
      await lockSetting(tx, JOBS_LOCK);
      // Entry before comment, the order of every comment writer (see `PrismaCommentRepository`).
      await tx.$queryRaw`SELECT id FROM contents WHERE id = ${comment.contentId} FOR UPDATE`;
      // One conditional UPDATE: a concurrent unapprove/spam either commits first (no match) or
      // waits for this row lock and commits after. Erased comments (empty body) never match, and
      // erasing a user erases their comments, so the job's subjects need no other check. Only
      // locking reads precede it, so it never fails a snapshot check either.
      const count = await tx.$executeRaw`
        UPDATE comments SET notified_at = ${at}
        WHERE id = ${comment.id} AND content_id = ${comment.contentId}
          AND status = 'approved' AND notified_at IS NULL AND body <> ''`;
      if (count === 1) await insertJob(tx, this.ids, job);
      return count === 1;
    });
  }

  async release(commentId: string) {
    const { count } = await this.db.comment.updateMany({
      where: { id: commentId, status: { not: 'approved' } },
      data: { notifiedAt: null },
    });
    return count === 1;
  }

  async replyMail(commentId: string) {
    return (
      (
        await this.db.comment.findUnique({
          where: { id: commentId },
          select: { replyMail: true },
        })
      )?.replyMail ?? false
    );
  }

  async muteReplyMail(commentId: string) {
    await this.db.comment.updateMany({
      where: { id: commentId },
      data: { replyMail: false },
    });
  }
}

/** Keys may contain email addresses, so only their SHA-256 is stored. */
const digest = (key: string) => createHash('sha256').update(key).digest('hex');

/** Locks (creating if needed) the window row of `id` for the rest of the transaction. */
const lockWindow = async (tx: Prisma.TransactionClient, id: string) => {
  // One statement takes the exclusive row lock whether or not the row existed (no gap-lock deadlock).
  await tx.$executeRaw`INSERT INTO notice_windows (\`key\`, window_end, sent, deferred) VALUES (${id}, ${new Date(0)}, 0, 0) ON DUPLICATE KEY UPDATE \`key\` = \`key\``;
  return tx.noticeWindow.findUniqueOrThrow({ where: { key: id } });
};

/** Counts one notice in its window and returns what it may queue. */
const count = async (
  tx: Prisma.TransactionClient,
  key: string,
  limit: number,
  windowMs: number,
  now: Date,
) => {
  const id = digest(key);
  const result = countNotice(await lockWindow(tx, id), limit, windowMs, now);
  await tx.noticeWindow.update({ where: { key: id }, data: result.next });
  return result;
};

export class PrismaNoticeOutbox implements NoticeOutbox {
  constructor(
    private readonly db: Database,
    private readonly ids: IdGenerator,
  ) {}

  dispatch(
    key: string,
    now: Date,
    plan: { jobs?: QueuedJob[]; items?: NoticeItem[] },
  ) {
    return this.db.$transaction(
      async (tx) => {
        await lockSetting(tx, JOBS_LOCK);
        const fresh =
          await tx.$executeRaw`INSERT IGNORE INTO notice_dispatches (\`key\`, created_at) VALUES (${digest(key)}, ${now})`;
        if (!fresh) return false;
        const jobs = plan.jobs ?? [];
        const items = plan.items ?? [];
        // Under the erasure lock: subjects erased since the plan was built drop out here.
        const erased = await erasedSubjects(tx, [
          ...jobs.flatMap((job) => job.subjects),
          ...items.flatMap((item) => item.subjects),
        ]);
        const live = (subjects: readonly string[]) =>
          !subjects.some((subject) => erased.has(subject));
        const insert = async (job: QueuedJob) => {
          if (live(job.subjects)) await insertJob(tx, this.ids, job);
        };
        for (const job of jobs) await insert(job);
        for (const item of items) {
          if (!live(item.subjects)) continue;
          const { window, thread } = item;
          const flood = await count(
            tx,
            window.key,
            window.limit,
            window.windowMs,
            now,
          );
          const queued = flood.admitted
            ? item.deliver(
                thread
                  ? (
                      await count(
                        tx,
                        thread.key,
                        Number.MAX_SAFE_INTEGER,
                        thread.windowMs,
                        now,
                      )
                    ).position - 1
                  : 0,
              )
            : flood.firstHeld
              ? [item.collect(flood.next.windowEnd)]
              : [];
          for (const job of queued) await insert(job);
        }
        return true;
      },
      { timeout: 30_000 },
    );
  }

  collect(window: string, build: (count: number) => QueuedJob[]) {
    return this.db.$transaction(async (tx) => {
      await lockSetting(tx, JOBS_LOCK);
      const id = digest(window);
      const row = await lockWindow(tx, id);
      if (!row.deferred) return 0;
      const jobs = build(row.deferred);
      // Under the erasure lock: a summary about an erased subject is dropped with its count.
      const erased = await erasedSubjects(
        tx,
        jobs.flatMap((job) => job.subjects),
      );
      for (const job of jobs)
        if (!job.subjects.some((subject) => erased.has(subject)))
          await insertJob(tx, this.ids, job);
      await tx.noticeWindow.update({
        where: { key: id },
        data: { deferred: 0 },
      });
      return row.deferred;
    });
  }

  async purge(before: Date) {
    await this.db.noticeWindow.deleteMany({
      where: { windowEnd: { lt: before }, deferred: 0 },
    });
    await this.db.noticeDispatch.deleteMany({
      where: { createdAt: { lt: before } },
    });
  }
}
