import type { Clock, HookDispatcher } from '#api/domain/ports';
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

/** Encrypted input that can be retried after the site's previous secret key is restored. */
export class RecoverableJobError extends Error {
  override name = 'RecoverableJobError';
}

export interface JobRunnerDeps {
  hooks?: HookDispatcher;
  queue: JobQueue;
  clock: Clock;
  logger: Logger;
  owner: string;
  maxAttempts?: number;
}

const BATCH = 4;
const LEASE_MS = 2 * 60 * 1000;
const FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const FAILURE_TEXT_MAX = 300;

/**
 * What the log may say about a job failure: the error's name, its codes (such as Prisma's `P2010`
 * and the database's own code) and its message, flattened to one line. Email addresses and URLs
 * (push endpoints, webhook targets) are masked, so personal data and capabilities stay out of
 * the log; the database message is preferred over Prisma's wrapper when present.
 */
export const failureSummary = (error: unknown) => {
  if (!(error instanceof Error)) return 'non-error thrown';
  const fields = error as Error & {
    code?: unknown;
    meta?: {
      driverAdapterError?: {
        cause?: { originalCode?: unknown; originalMessage?: unknown };
      };
    };
  };
  const database = fields.meta?.driverAdapterError?.cause;
  const codes = [fields.code, database?.originalCode].filter(
    (code) => typeof code === 'string' || typeof code === 'number',
  );
  const message = (
    typeof database?.originalMessage === 'string'
      ? database.originalMessage
      : error.message
  )
    .replace(/\b[a-z][\w+.-]*:\/\/[^\s'"`<>]+/gi, (url) => {
      try {
        return `${new URL(url).origin}/…`;
      } catch {
        return '<url>';
      }
    })
    .replace(/[^\s'"`<>@(),;]+@[^\s'"`<>@(),;]+/g, '<email>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FAILURE_TEXT_MAX);
  return `${error.name}${codes.length ? ` [${codes.join(' ')}]` : ''}: ${message}`;
};

/** Exponential backoff: 1, 2, 4 … minutes, at most an hour. */
const backoffMs = (attempt: number) =>
  Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** (attempt - 1));

/** Drains due jobs with their registered handlers. */
export class JobRunner {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(private readonly deps: JobRunnerDeps) {}

  kinds(): string[] {
    return [...this.handlers.keys()];
  }

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

  /** Scrubs historical plaintext payloads, then removes expired failure metadata. */
  async purge(): Promise<number> {
    await this.deps.queue.scrubFailed([Errors.JobPayloadUnreadable], 500);
    return this.deps.queue.purge(
      new Date(this.deps.clock.now().getTime() - FAILED_RETENTION_MS),
    );
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
          const recoverable = error instanceof RecoverableJobError;
          const retry =
            !(error instanceof PermanentJobError) &&
            !recoverable &&
            attempt < maxAttempts
              ? new Date(clock.now().getTime() + backoffMs(attempt))
              : null;
          logger.warn(
            `Job ${job.kind} failed (attempt ${attempt}): ${Errors.JobFailed} (${failureSummary(error)})`,
          );
          await queue.fail(
            job.id,
            owner,
            recoverable ? Errors.JobPayloadUnreadable : Errors.JobFailed,
            retry,
            recoverable,
          );
          void this.deps.hooks?.emit('job.failed', {
            id: job.id,
            kind: job.kind,
            attempts: attempt,
            retryAt: retry?.toISOString() ?? null,
          });
        }
      }),
    );
  }
}
