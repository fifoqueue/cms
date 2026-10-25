import { Errors } from '#api/shared/errors';
import { createHash } from 'node:crypto';
import { sealJob, openJob } from '#api/domain/jobs/payload';
import type { SecretBox } from '#api/domain/ports';
import { stringifyJson } from '@cms/sdk';
import type { JobQueue } from '#api/domain/jobs/ports';
import type { IdGenerator } from '#api/domain/ports';
import { lockSetting } from '#api/infra/prisma/client';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

/** Writes one queued job inside `tx`; callers hold the `privacy.jobs` lock (erasure scans under it). */
export const insertJob = (
  tx: Prisma.TransactionClient,
  ids: IdGenerator,
  job: { kind: string; payload: unknown; runAt?: Date; expiresAt: Date },
) =>
  tx.job.create({
    data: {
      id: ids.next(),
      kind: job.kind,
      payload: stringifyJson(job.payload),
      runAt: job.runAt ?? new Date(),
      expiresAt: job.expiresAt,
      createdAt: new Date(),
    },
  });

/**
 * Which of `refs` (a job's subjects) name an erased comment or user. Read inside `tx` after it
 * took the `privacy.jobs` lock, so an erasure either committed before (and is seen) or scans the
 * job written here after this transaction commits.
 */
export const erasedSubjects = async (
  tx: Prisma.TransactionClient,
  refs: readonly unknown[],
) => {
  const ids = [
    ...new Set(
      refs.filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0 && value.length <= 36,
      ),
    ),
  ];
  if (!ids.length) return new Set<string>();
  const [comments, users] = await Promise.all([
    tx.comment.findMany({
      where: { id: { in: ids }, authorEmail: '', body: '', userId: null },
      select: { id: true },
    }),
    tx.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true },
    }),
  ]);
  return new Set([
    ...comments.map((row) => row.id),
    ...users
      .filter((user) => user.email === `erased-${user.id}@invalid.invalid`)
      .map((user) => user.id),
  ]);
};

export class PrismaJobQueue implements JobQueue {
  constructor(
    private readonly db: Database,
    private readonly ids: IdGenerator,
    private readonly secrets?: SecretBox,
  ) {}

  async enqueue(
    kind: string,
    payload: unknown,
    runAt = new Date(),
    expiresAt = new Date(Date.now() + 7 * 86400000),
  ) {
    await this.db.$transaction(async (tx) => {
      await lockSetting(tx, 'privacy.jobs');
      if (this.secrets) {
        const opened = openJob(payload, this.secrets) as {
          subjects?: unknown;
          data?: { id?: unknown; authorId?: unknown; uploaderId?: unknown };
        } | null;
        const refs = [
          ...(Array.isArray(opened?.subjects) ? opened.subjects : []),
          opened?.data?.id,
          opened?.data?.authorId,
          opened?.data?.uploaderId,
        ];
        if ((await erasedSubjects(tx, refs)).size) return;
      }
      await insertJob(tx, this.ids, { kind, payload, runAt, expiresAt });
    });
  }

  /** Upgrade old plaintext queued/failed snapshots before starting workers. */
  async sealLegacy() {
    if (!this.secrets) return;
    let after = '';
    for (;;) {
      const rows = await this.db.job.findMany({
        where: {
          id: { gt: after },
          kind: { in: ['email.send', 'webhook.deliver'] },
        },
        orderBy: { id: 'asc' },
        take: 200,
      });
      for (const row of rows) {
        let payload: unknown;
        try {
          payload = JSON.parse(row.payload);
        } catch {
          payload = row.payload;
        }
        if (payload && typeof payload === 'object' && 'sealed' in payload)
          continue;
        let expiresAt =
          row.expiresAt ?? new Date(row.createdAt.getTime() + 7 * 86400000);
        const text =
          payload &&
          typeof payload === 'object' &&
          'text' in payload &&
          typeof payload.text === 'string'
            ? payload.text
            : '';
        const token = /\/admin\/password\?token=([A-Za-z0-9_-]+)/.exec(
          text,
        )?.[1];
        if (token) {
          const grant = await this.db.passwordToken.findUnique({
            where: {
              tokenHash: createHash('sha256').update(token).digest('hex'),
            },
            select: { expiresAt: true },
          });
          expiresAt = grant?.expiresAt ?? new Date(0);
        }

        await this.db.job.updateMany({
          where: { id: row.id, payload: row.payload },
          data: {
            payload: stringifyJson(sealJob(payload, this.secrets)),
            expiresAt,
            lastError: row.lastError ? Errors.JobFailed : null,
          },
        });
      }
      if (rows.length < 200) break;
      after = rows.at(-1)!.id;
    }
  }

  async claim(limit: number, owner: string, leaseMs: number, now: Date) {
    await this.db.job.deleteMany({
      where: {
        AND: [{ OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] }],
        OR: [
          { expiresAt: { lte: now } },
          {
            expiresAt: null,
            createdAt: { lt: new Date(now.getTime() - 7 * 86400000) },
          },
        ],
      },
    });
    return this.db.$transaction(async (tx) => {
      // SKIP LOCKED lets several processes drain the queue without waiting on each other.
      const rows = await tx.$queryRaw<
        { id: string; kind: string; payload: string; attempts: number }[]
      >(Prisma.sql`
        SELECT id, kind, payload, attempts FROM jobs
        WHERE failed_at IS NULL AND run_at <= ${now}
          AND (locked_until IS NULL OR locked_until < ${now})
        ORDER BY run_at ASC LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length)
        await tx.job.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: {
            lockedUntil: new Date(now.getTime() + leaseMs),
            lockedBy: owner,
          },
        });
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        payload: JSON.parse(row.payload) as unknown,
        attempts: Number(row.attempts),
      }));
    });
  }

  async complete(id: string, owner: string) {
    const { count } = await this.db.job.deleteMany({
      where: { id, lockedBy: owner },
    });
    return count === 1;
  }

  async pending(kind: string, id: string) {
    return (
      (await this.db.job.findFirst({
        where: {
          kind,
          payload: JSON.stringify({ id }),
          failedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
            { lockedUntil: { gt: new Date() } },
          ],
        },
        select: { id: true },
      })) !== null
    );
  }

  async fail(
    id: string,
    owner: string,
    error: string,
    retryAt: Date | null,
    preservePayload = false,
  ) {
    const { count } = await this.db.job.updateMany({
      where: { id, lockedBy: owner },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 2000),
        lockedUntil: null,
        lockedBy: null,
        ...(retryAt
          ? { runAt: retryAt }
          : {
              failedAt: new Date(),
              ...(!preservePayload && { payload: 'null' }),
            }),
      },
    });
    return count === 1;
  }

  async failedPayloads(kind: string, error: string, limit: number) {
    const rows = await this.db.job.findMany({
      where: {
        kind,
        lastError: error,
        failedAt: { not: null },
        payload: { not: 'null' },
      },
      select: { id: true, payload: true },
      take: limit,
    });
    return rows.flatMap(({ id, payload }) => {
      try {
        return [{ id, payload: JSON.parse(payload) as unknown }];
      } catch {
        return [];
      }
    });
  }

  async retry(ids: readonly string[]) {
    if (!ids.length) return 0;
    const { count } = await this.db.job.updateMany({
      where: { id: { in: [...ids] }, failedAt: { not: null } },
      data: { attempts: 0, failedAt: null, lastError: null, runAt: new Date() },
    });
    return count;
  }

  async scrubFailed(preserveErrors: readonly string[], limit: number) {
    const rows = await this.db.job.findMany({
      where: {
        failedAt: { not: null },
        payload: { not: 'null' },
        ...(preserveErrors.length && {
          NOT: { lastError: { in: [...preserveErrors] } },
        }),
      },
      select: { id: true },
      take: limit,
    });
    if (!rows.length) return 0;
    const { count } = await this.db.job.updateMany({
      where: { id: { in: rows.map(({ id }) => id) } },
      data: { payload: 'null' },
    });
    return count;
  }

  async failures(limit: number) {
    const rows = await this.db.job.findMany({
      where: { failedAt: { not: null } },
      select: { kind: true, lastError: true, failedAt: true },
      orderBy: { failedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      kind: row.kind,
      error:
        row.lastError === Errors.JobPayloadUnreadable
          ? Errors.JobFailed
          : (row.lastError ?? ''),
      failedAt: row.failedAt!,
    }));
  }

  async purge(before: Date) {
    const { count } = await this.db.job.deleteMany({
      where: { failedAt: { lt: before } },
    });
    return count;
  }
}
