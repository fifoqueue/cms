import { stringifyJson } from '@cms/sdk';
import type { JobQueue } from '#api/domain/jobs/ports';
import type { IdGenerator } from '#api/domain/ports';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

export class PrismaJobQueue implements JobQueue {
  constructor(
    private readonly db: Database,
    private readonly ids: IdGenerator,
  ) {}

  async enqueue(kind: string, payload: unknown, runAt = new Date()) {
    await this.db.job.create({
      data: {
        id: this.ids.next(),
        kind,
        payload: stringifyJson(payload),
        runAt,
        createdAt: new Date(),
      },
    });
  }

  async claim(limit: number, owner: string, leaseMs: number, now: Date) {
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

  async fail(id: string, owner: string, error: string, retryAt: Date | null) {
    const { count } = await this.db.job.updateMany({
      where: { id, lockedBy: owner },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 2000),
        lockedUntil: null,
        lockedBy: null,
        ...(retryAt
          ? { runAt: retryAt }
          : { failedAt: new Date(), payload: 'null' }),
      },
    });
    return count === 1;
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
      error: row.lastError ?? '',
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
