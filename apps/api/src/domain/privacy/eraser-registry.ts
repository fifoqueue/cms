import {
  extensionKeySchema,
  privacyErasureResultSchema,
} from '@cms/sdk/plugin';
import type { PrivacyEraser, PrivacyErasureResult } from '@cms/sdk/plugin';
import type { PrivacyRequest } from '@cms/sdk';
import { parseInput } from '#api/shared/validation';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';

/** Extension erasers run after core's transaction and cannot prevent core erasure. */
export class EraserRegistry {
  private readonly entries = new Map<
    object,
    { id: string; eraser: PrivacyEraser; core: boolean }
  >();
  constructor(
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}
  register(owner: string, key: string, eraser: PrivacyEraser) {
    const id = `${parseInput(extensionKeySchema, owner)}:${parseInput(extensionKeySchema, key)}`;
    return this.add(id, eraser, false);
  }
  registerCore(key: string, eraser: PrivacyEraser) {
    return this.add(
      `core:${parseInput(extensionKeySchema, key)}`,
      eraser,
      true,
    );
  }
  private add(id: string, eraser: PrivacyEraser, core: boolean) {
    const token = {};
    this.entries.set(token, {
      id,
      core,
      eraser: { erase: eraser.erase.bind(eraser) },
    });
    return () => {
      this.entries.delete(token);
    };
  }
  async erase(request: PrivacyRequest) {
    const results: Record<string, PrivacyErasureResult> = {};
    const failed: string[] = [];
    // Core errors preserve the existing transactional safeguards. Plugin failures never suppress core.
    for (const [token, entry] of this.entries) {
      if (!entry.core || !this.entries.has(token)) continue;
      results[entry.id] = privacyErasureResultSchema.parse(
        await entry.eraser.erase(structuredClone(request)),
      );
    }
    for (const [token, entry] of [...this.entries]) {
      if (entry.core) continue;
      if (!this.entries.has(token)) continue;
      const result = await isolate(
        () => entry.eraser.erase(structuredClone(request)),
        this.options.timeoutMs,
      );
      if (!this.entries.has(token)) {
        failed.push(entry.id);
        continue;
      }
      const parsed = result.ok
        ? privacyErasureResultSchema.safeParse(result.value)
        : null;
      if (parsed?.success) results[entry.id] = parsed.data;
      else {
        failed.push(entry.id);
        this.options.logger.warn(
          `Privacy eraser "${entry.id}" failed; core erasure is unaffected`,
        );
      }
    }
    return { results, failed };
  }
}
