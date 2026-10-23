import type {
  JobQueue,
  QueuedJob,
  TaskLeases,
  TaskState,
} from '#api/domain/jobs/ports';

interface Lease extends TaskState {
  lockedUntil: Date | null;
  lockedBy: string | null;
}

/** Same contract as `PrismaTaskLeases`; instances sharing it act like processes sharing a DB. */
export class MemoryTaskLeases implements TaskLeases {
  readonly rows = new Map<string, Lease>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async ensure(name: string) {
    if (!this.rows.has(name))
      this.rows.set(name, {
        name,
        nextRunAt: this.now(),
        lastRunAt: null,
        lastError: null,
        lockedUntil: null,
        lockedBy: null,
      });
  }

  async claim(name: string, owner: string, leaseMs: number, now: Date) {
    const row = this.rows.get(name);
    if (
      !row ||
      row.nextRunAt > now ||
      (row.lockedUntil && row.lockedUntil >= now)
    )
      return false;
    row.lockedUntil = new Date(now.getTime() + leaseMs);
    row.lockedBy = owner;
    return true;
  }

  async extend(name: string, owner: string, leaseMs: number, now: Date) {
    const row = this.rows.get(name);
    if (!row || row.lockedBy !== owner) return false;
    row.lockedUntil = new Date(now.getTime() + leaseMs);
    return true;
  }

  async release(
    name: string,
    owner: string,
    nextRunAt: Date,
    error: string | null,
  ) {
    const row = this.rows.get(name)!;
    if (row.lockedBy !== owner) return false;
    Object.assign(row, {
      nextRunAt,
      lockedUntil: null,
      lockedBy: null,
      lastRunAt: this.now(),
      lastError: error,
    });
    return true;
  }

  async list() {
    return [...this.rows.values()].map(
      ({ lockedUntil: _lockedUntil, lockedBy: _lockedBy, ...row }) => row,
    );
  }
}

interface Row extends QueuedJob {
  expiresAt: Date;
  runAt: Date;
  lockedUntil: Date | null;
  error: string | null;
  failedAt: Date | null;
  lockedBy: string | null;
}

/** Same contract as `PrismaJobQueue`. */
export class MemoryJobQueue implements JobQueue {
  readonly rows = new Map<string, Row>();
  private sequence = 0;

  async enqueue(
    kind: string,
    payload: unknown,
    runAt = new Date(0),
    expiresAt = new Date(Date.now() + 7 * 86400000),
  ) {
    const id = `job-${++this.sequence}`;
    this.rows.set(id, {
      id,
      kind,
      payload: structuredClone(payload),
      attempts: 0,
      runAt,
      expiresAt,
      lockedUntil: null,
      error: null,
      failedAt: null,
      lockedBy: null,
    });
  }

  async claim(limit: number, owner: string, leaseMs: number, now: Date) {
    for (const row of this.rows.values())
      if (row.expiresAt <= now) this.rows.delete(row.id);
    const due = [...this.rows.values()]
      .filter(
        (row) =>
          !row.failedAt &&
          row.runAt <= now &&
          (!row.lockedUntil || row.lockedUntil < now),
      )
      .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
      .slice(0, limit);
    for (const row of due) {
      row.lockedUntil = new Date(now.getTime() + leaseMs);
      row.lockedBy = owner;
    }
    return due.map(({ id, kind, payload, attempts }) => ({
      id,
      kind,
      payload: structuredClone(payload),
      attempts,
    }));
  }

  async complete(id: string, owner: string) {
    return this.rows.get(id)?.lockedBy === owner ? this.rows.delete(id) : false;
  }

  async fail(id: string, owner: string, error: string, retryAt: Date | null) {
    const row = this.rows.get(id)!;
    if (row.lockedBy !== owner) return false;
    row.attempts += 1;
    row.error = error;
    row.lockedUntil = null;
    row.lockedBy = null;
    if (retryAt) row.runAt = retryAt;
    else row.failedAt = new Date();
    return true;
  }

  async failures(limit: number) {
    return [...this.rows.values()]
      .filter((row) => row.failedAt)
      .slice(0, limit)
      .map((row) => ({
        kind: row.kind,
        error: row.error ?? '',
        failedAt: row.failedAt!,
      }));
  }
}
