import { z } from 'zod';
import type { JobRegistrar } from '@cms/sdk/plugin';
import type { Clock } from '#api/domain/ports';
import type { JobRunner } from '#api/domain/jobs/job-runner';
import type { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { Errors } from '#api/shared/errors';
import { isolate } from '#api/shared/isolate';

/** Plugin jobs share the core durable runner, leases and retry policy; all payloads are sealed. */
export class PluginJobs {
  constructor(
    private readonly runner: JobRunner,
    private readonly sealed: SealedJobs,
    private readonly clock: Clock,
  ) {}

  registrar(owner: string): JobRegistrar {
    const kinds = new Map<string, z.ZodType>();
    const id = (kind: string) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(kind) || kind.length > 64)
        throw new Error(Errors.InvalidInput);
      return `plugin:${owner}:${kind}`;
    };
    return {
      register: (kind, definition) => {
        const name = id(kind);
        if (kinds.has(name)) throw new Error(Errors.InvalidInput);
        const schema = definition.schema;
        kinds.set(name, schema);
        const release = this.runner.handle(name, async (payload) => {
          const result = await isolate(async () => {
            const opened = this.sealed.open(payload, schema);
            return definition.run(opened);
          }, 60_000);
          if (!result.ok) throw result.error;
          if (!z.void().safeParse(result.value).success)
            throw new Error(Errors.JobFailed);
        });
        return () => {
          if (kinds.get(name) !== schema) return;
          kinds.delete(name);
          release();
        };
      },
      enqueue: async (kind, payload, options = {}) => {
        const name = id(kind);
        const schema = kinds.get(name);
        if (!schema) throw new Error(Errors.JobKindUnknown(name));
        const delay = z
          .number()
          .int()
          .min(0)
          .max(2_147_483_647)
          .parse(options.delayMs ?? 0);
        const data = z.json().safeParse(structuredClone(payload));
        if (
          !data.success ||
          new TextEncoder().encode(JSON.stringify(data.data)).byteLength >
            65_536
        )
          throw new Error(Errors.JobPayloadInvalid);
        const result = await isolate(
          () => schema.parse(structuredClone(data.data)),
          3000,
        );
        if (!result.ok) throw new Error(Errors.JobPayloadInvalid);
        if (kinds.get(name) !== schema) throw new Error(Errors.PluginInactive);
        await this.sealed.enqueue(
          name,
          data.data,
          undefined,
          new Date(this.clock.now().getTime() + delay),
        );
      },
    };
  }
}
