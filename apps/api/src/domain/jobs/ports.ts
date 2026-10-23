/**
 * Exclusive leases on named recurring tasks, shared by every API process. A task runs only in the
 * process that claimed it, and again only after its next run time.
 */
export interface TaskLeases {
  /** Creates the task if missing, due now. Existing schedules are kept. */
  ensure(name: string): Promise<void>;
  /** Claims the task for `leaseMs` when it is due and not leased. True when this caller won. */
  claim(
    name: string,
    owner: string,
    leaseMs: number,
    now: Date,
  ): Promise<boolean>;
  /** Extends a lease only while `owner` still holds it. */
  extend(
    name: string,
    owner: string,
    leaseMs: number,
    now: Date,
  ): Promise<boolean>;
  /** Ends only `owner`'s lease and schedules the next run. */
  release(
    name: string,
    owner: string,
    nextRunAt: Date,
    error: string | null,
  ): Promise<boolean>;
  /** Every task with its schedule, for site health. */
  list(): Promise<TaskState[]>;
}

export interface TaskState {
  name: string;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastError: string | null;
}

export interface QueuedJob {
  id: string;
  kind: string;
  payload: unknown;
  /** Attempts already made, this one excluded. */
  attempts: number;
}

/** Durable one-off work with retries (email, webhook deliveries, imports). */
export interface JobQueue {
  enqueue(kind: string, payload: unknown, runAt?: Date): Promise<void>;
  /** Leases up to `limit` due jobs for `leaseMs`; other processes skip them meanwhile. */
  claim(
    limit: number,
    owner: string,
    leaseMs: number,
    now: Date,
  ): Promise<QueuedJob[]>;
  /** Completes only a job still leased by `owner`. */
  complete(id: string, owner: string): Promise<boolean>;
  /** Schedules a retry at `retryAt`, or gives up when it is null. */
  fail(
    id: string,
    owner: string,
    error: string,
    retryAt: Date | null,
  ): Promise<boolean>;
  /** Jobs that gave up, newest first, for site health. */
  failures(
    limit: number,
  ): Promise<{ kind: string; error: string; failedAt: Date }[]>;
  /** Deletes failed-job metadata older than `before`; final failures already have no payload. */
  purge(before: Date): Promise<number>;
}
