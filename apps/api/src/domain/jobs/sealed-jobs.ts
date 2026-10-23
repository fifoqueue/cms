import type { z } from 'zod';
import { inspectJob, sealJob } from '#api/domain/jobs/payload';
import type { JobQueue } from '#api/domain/jobs/ports';
import {
  PermanentJobError,
  RecoverableJobError,
} from '#api/domain/jobs/job-runner';
import type { SecretBox } from '#api/domain/ports';
import { Errors } from '#api/shared/errors';

/** Sensitive job payloads encrypted before they reach durable queue storage. */
export class SealedJobs {
  constructor(
    private readonly queue: JobQueue,
    private readonly secrets: SecretBox,
  ) {}

  enqueue(kind: string, payload: unknown, expiresAt?: Date) {
    return this.queue.enqueue(
      kind,
      sealJob(payload, this.secrets),
      undefined,
      expiresAt,
    );
  }

  open<T>(payload: unknown, schema: z.ZodType<T>): T {
    const opened = inspectJob(payload, this.secrets);
    if (!opened.ok && opened.reason === 'unreadable')
      throw new RecoverableJobError(Errors.JobPayloadUnreadable);
    if (!opened.ok) throw new PermanentJobError(Errors.JobPayloadInvalid);
    const result = schema.safeParse(opened.value);
    if (result.success) return result.data;
    throw new PermanentJobError(Errors.JobPayloadInvalid);
  }

  /** Requeues ciphertext only after the current or previous key can open it. */
  async recover(kinds: readonly string[]) {
    for (const kind of kinds) {
      const rows = await this.queue.failedPayloads(
        kind,
        Errors.JobPayloadUnreadable,
        100,
      );
      const readable = rows.flatMap(({ id, payload }) => {
        const opened = inspectJob(payload, this.secrets);
        return opened.ok && opened.sealed ? [id] : [];
      });
      if (readable.length) await this.queue.retry(readable);
    }
  }
}
