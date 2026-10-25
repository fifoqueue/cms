import type { z } from 'zod';
import type { HealthCheck } from '#sdk/health';

export interface HealthCheckRegistrar {
  register(
    key: string,
    check: () => Omit<HealthCheck, 'key'> | Promise<Omit<HealthCheck, 'key'>>,
  ): () => void;
}

export interface JobRegistrar {
  register<T>(
    kind: string,
    definition: {
      schema: z.ZodType<T>;
      run(payload: T): void | Promise<void>;
    },
  ): () => void;
  enqueue(
    kind: string,
    payload: unknown,
    options?: { delayMs?: number },
  ): Promise<void>;
}
