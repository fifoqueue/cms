import type { Clock } from '#api/domain/ports';
import type { JobQueue } from '#api/domain/jobs/ports';
import type { RecurringTask } from '#api/domain/jobs/scheduler';
import type { Logger } from '#api/shared/logger';
import { Errors } from '#api/shared/errors';

/** Handles one job. Throwing schedules a retry; `PermanentJobError` gives up at once. */
export type JobHandler = (payload: unknown) => Promise<void>;

/** A failure that a retry cannot fix, such as an invalid recipient. */
export class PermanentJobError extends Error {
  override name = 'PermanentJobError';
}

export interface JobRunnerDeps {
  queue: JobQueue;
  clock: Clock;
  logger: Logger;
  owner: string;
  maxAttempts?: number;
}

const BATCH = 4;
const LEASE_MS = 2 * 60 * 1000;

/** Exponential backoff: 1, 2, 4 … minutes, at most an hour. */
const backoffMs = (attempt: number) =>
  Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** (attempt - 1));

/** Drains due jobs with their registered handlers. */
export class JobRunner {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(private readonly deps: JobRunnerDeps) {}

  handle(kind: string, handler: JobHandler): () => void {
    this.handlers.set(kind, handler);
    return () => {
      if (this.handlers.get(kind) === handler) this.handlers.delete(kind);
    };
  }

  /** The recurring task that drains the queue. */
  task(intervalMs: number): RecurringTask {
    return { name: 'jobs', intervalMs, run: () => this.drain() };
  }

  async drain(): Promise<void> {
    const { queue, clock, logger, owner, maxAttempts = 8 } = this.deps;
    const jobs = await queue.claim(BATCH, owner, LEASE_MS, clock.now());
    await Promise.all(
      jobs.map(async (job) => {
        const handler = this.handlers.get(job.kind);
        try {
          if (!handler)
            throw new PermanentJobError(Errors.JobKindUnknown(job.kind));
          await handler(job.payload);
          await queue.complete(job.id, owner);
        } catch (error) {
          const attempt = job.attempts + 1;
          const retry =
            !(error instanceof PermanentJobError) && attempt < maxAttempts
              ? new Date(clock.now().getTime() + backoffMs(attempt))
              : null;
          logger.warn(
            `Job ${job.kind} failed (attempt ${attempt}): ${Errors.JobFailed}`,
          );
          await queue.fail(job.id, owner, Errors.JobFailed, retry);
        }
      }),
    );
  }
}
