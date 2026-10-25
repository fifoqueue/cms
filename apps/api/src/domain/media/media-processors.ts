import type { MediaType } from '@cms/sdk';
import type { MediaProcessor, MediaProcessorRegistrar } from '@cms/sdk/plugin';
import { z } from 'zod';
import { Errors } from '#api/shared/errors';
import { isolate } from '#api/shared/isolate';

const bytesSchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.length > 0);

/**
 * Optimization chain. Plugin processors run isolated; core re-encoding is mandatory, runs
 * directly after them and its errors propagate.
 */
export class MediaProcessors implements MediaProcessorRegistrar {
  private readonly entries = new Set<MediaProcessor>();
  private readonly core = new Set<MediaProcessor>();
  constructor(private readonly timeoutMs = 3000) {}
  register(processor: MediaProcessor) {
    return this.add(this.entries, processor);
  }
  /** Composition-root only: plugin contexts expose `register`. */
  registerCore(processor: MediaProcessor) {
    return this.add(this.core, processor);
  }
  private add(entries: Set<MediaProcessor>, processor: MediaProcessor) {
    const entry = { process: processor.process.bind(processor) };
    entries.add(entry);
    return () => {
      entries.delete(entry);
    };
  }
  async process(bytes: Uint8Array, mime: MediaType) {
    const original = bytes.slice();
    let current = original;
    for (const entry of [...this.entries]) {
      if (!this.entries.has(entry)) continue;
      const result = await isolate(
        () => entry.process({ bytes: current.slice(), mime }),
        this.timeoutMs,
      );
      if (!result.ok || !this.entries.has(entry)) continue;
      const parsed = bytesSchema.safeParse(result.value);
      if (parsed.success) current = parsed.data.slice();
    }
    if (current !== original) {
      try {
        return await this.clean(current, mime);
      } catch {
        // Nonempty plugin bytes that core cannot decode are invalid plugin output.
      }
    }
    return this.clean(original, mime);
  }
  private async clean(bytes: Uint8Array, mime: MediaType) {
    if (this.core.size === 0) throw new Error(Errors.MediaProcessorMissing);
    let current = bytes;
    for (const entry of [...this.core])
      current = bytesSchema.parse(
        await entry.process({ bytes: current.slice(), mime }),
      );
    return current;
  }
}
