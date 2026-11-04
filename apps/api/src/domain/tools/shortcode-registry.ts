import type { ImportShortcode } from '@cms/sdk/plugin';
import { z } from 'zod';
import { isolate } from '#api/shared/isolate';
import { parseInput } from '#api/shared/validation';

const tagSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/)
  .refine(
    (tag) => !['caption', 'gallery', 'embed', 'audio', 'video'].includes(tag),
  );
const outputSchema = z.string().max(1024 * 1024);

/** Revoked and failed converters leave the original shortcode untouched. */
export class ShortcodeRegistry {
  private readonly entries = new Map<
    object,
    { tag: string; convert: ImportShortcode['convert'] }
  >();

  constructor(private readonly timeoutMs = 3000) {}

  register(tag: string, definition: ImportShortcode) {
    parseInput(tagSchema, tag);
    const token = {};

    this.entries.set(token, {
      tag,
      convert: definition.convert.bind(definition),
    });

    return () => {
      this.entries.delete(token);
    };
  }

  has(tag?: string) {
    return tag === undefined
      ? this.entries.size > 0
      : [...this.entries.values()].some((entry) => entry.tag === tag);
  }

  async convert(
    tag: string,
    attrs: Record<string, string>,
    inner: string,
  ): Promise<string | null> {
    for (const [token, entry] of [...this.entries].reverse()) {
      if (entry.tag !== tag || !this.entries.has(token)) continue;
      const result = await isolate(
        () => entry.convert(structuredClone(attrs), inner),
        this.timeoutMs,
      );
      const parsed = result.ok ? outputSchema.safeParse(result.value) : null;

      if (this.entries.has(token) && parsed?.success) return parsed.data;
    }

    return null;
  }
}
