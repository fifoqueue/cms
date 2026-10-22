import type { TaskLeases } from '#api/domain/jobs/ports';
import type { Database } from '#api/infra/prisma/client';

export class PrismaTaskLeases implements TaskLeases {
  constructor(private readonly db: Database) {}

  async ensure(name: string) {
    await this.db
      .$executeRaw`INSERT IGNORE INTO scheduled_tasks (name, next_run_at) VALUES (${name}, NOW(3))`;
  }

  async claim(name: string, owner: string, leaseMs: number, now: Date) {
    // One conditional update: only one process can move an unleased, due row.
    const { count } = await this.db.scheduledTask.updateMany({
      where: {
        name,
        nextRunAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: {
        lockedUntil: new Date(now.getTime() + leaseMs),
        lockedBy: owner,
      },
    });
    return count === 1;
  }

  async extend(name: string, owner: string, leaseMs: number, now: Date) {
    const { count } = await this.db.scheduledTask.updateMany({
      where: { name, lockedBy: owner },
      data: { lockedUntil: new Date(now.getTime() + leaseMs) },
    });
    return count === 1;
  }

  async release(
    name: string,
    owner: string,
    nextRunAt: Date,
    error: string | null,
  ) {
    const { count } = await this.db.scheduledTask.updateMany({
      where: { name, lockedBy: owner },
      data: {
        nextRunAt,
        lockedUntil: null,
        lockedBy: null,
        lastRunAt: new Date(),
        lastError: error,
      },
    });
    return count === 1;
  }

  async list() {
    return this.db.scheduledTask.findMany({
      select: { name: true, nextRunAt: true, lastRunAt: true, lastError: true },
      orderBy: { name: 'asc' },
    });
  }
}
