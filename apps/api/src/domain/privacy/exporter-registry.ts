import { privacyExportDataSchema } from '@cms/sdk';
import type { PrivacyRequest, JsonValue } from '@cms/sdk';
import { extensionKeySchema } from '@cms/sdk/plugin';
import type { PrivacyExporter } from '@cms/sdk/plugin';
import { isolate } from '#api/shared/isolate';
import { parseInput } from '#api/shared/validation';

/** Exporters receive only the confirmed subject address and cannot replace core sections. */
export class ExporterRegistry {
  private readonly entries = new Map<
    object,
    { id: string; run: PrivacyExporter['export'] }
  >();

  constructor(private readonly timeoutMs = 3000) {}

  register(owner: string, key: string, definition: PrivacyExporter) {
    parseInput(extensionKeySchema, key);
    const token = {};
    const id = `${owner}:${key}`;

    this.entries.set(token, { id, run: definition.export.bind(definition) });

    return () => {
      this.entries.delete(token);
    };
  }

  async export(request: PrivacyRequest) {
    const data: Record<string, JsonValue> = {};

    for (const [token, entry] of [...this.entries]) {
      if (!this.entries.has(token)) continue;
      const result = await isolate(async () => {
        const output = await entry.run({ email: request.email });
        const parsed = privacyExportDataSchema.safeParse({
          request,
          data: output,
        });

        return parsed.success ? structuredClone(parsed.data.data) : null;
      }, this.timeoutMs);

      if (!this.entries.has(token) || !result.ok || result.value === null)
        continue;
      const merged = privacyExportDataSchema.safeParse({
        request,
        data: { ...data, [entry.id]: result.value },
      });

      if (merged.success) data[entry.id] = result.value;
    }

    return data;
  }
}
