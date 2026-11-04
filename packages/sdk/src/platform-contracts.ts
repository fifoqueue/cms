import type { z } from 'zod';
import type { HealthCheck } from '#sdk/health';
import type { JsonValue } from '#sdk/common';

export interface PrivacyExporter {
  export(user: {
    email: string;
  }): Record<string, JsonValue> | Promise<Record<string, JsonValue>>;
}

export interface PrivacyExporterRegistrar {
  register(key: string, definition: PrivacyExporter): () => void;
}

export interface ImportShortcode {
  convert(
    attrs: Record<string, string>,
    inner: string,
  ): string | Promise<string>;
}

export interface ImportShortcodeRegistrar {
  register(tag: string, definition: ImportShortcode): () => void;
}

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
