import { z } from 'zod';
import type { JobQueue } from '#api/domain/jobs/ports';
import {
  PermanentJobError,
  RecoverableJobError,
} from '#api/domain/jobs/job-runner';
import type { SecretBox } from '#api/domain/ports';
import { Errors } from '#api/shared/errors';

const envelopeSchema = z.strictObject({
  version: z.literal(1),
  sealed: z.string(),
});

/** Sensitive job payloads encrypted before they reach durable queue storage. */
export class SealedJobs {
  constructor(
    private readonly queue: JobQueue,
    private readonly secrets: SecretBox,
  ) {}

  enqueue(kind: string, payload: unknown) {
    return this.queue.enqueue(kind, {
      version: 1,
      sealed: this.secrets.seal(JSON.stringify(payload)),
    });
  }

  open<T>(payload: unknown, schema: z.ZodType<T>): T {
    const envelope = envelopeSchema.safeParse(payload);
    if (!envelope.success)
      throw new PermanentJobError(Errors.JobPayloadInvalid);
    const plain = this.secrets.open(envelope.data.sealed);
    if (plain === null)
      throw new RecoverableJobError(Errors.JobPayloadUnreadable);
    try {
      const result = schema.safeParse(JSON.parse(plain) as unknown);
      if (result.success) return result.data;
    } catch {
      // The common invalid-payload error below intentionally hides parser details.
    }
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
        const envelope = envelopeSchema.safeParse(payload);
        return envelope.success &&
          this.secrets.open(envelope.data.sealed) !== null
          ? [id]
          : [];
      });
      if (readable.length) await this.queue.retry(readable);
    }
  }
}
