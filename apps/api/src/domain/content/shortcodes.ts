import type { BlockRenderContext, ShortcodeDefinition } from '@cms/sdk/plugin';
import { mapContentText, sanitizeShortcodeHtml } from '@cms/content/parse';
import { customShortcodes } from '#api/domain/tools/classic-content';
import {
  shortcodeTagSchema,
  shortcodeOutputSchema,
} from '#api/domain/tools/shortcode-registry';
import { parseInput } from '#api/shared/validation';
import { isolate } from '#api/shared/isolate';

/** Runtime registrations are released by their owner; renders are cached only within one expansion. */
export class RuntimeShortcodes {
  private readonly entries = new Map<
    object,
    { tag: string; definition: ShortcodeDefinition }
  >();

  constructor(private readonly timeoutMs = 3000) {}

  register(tag: string, definition: ShortcodeDefinition) {
    parseInput(shortcodeTagSchema, tag);
    const token = {};

    this.entries.set(token, { tag, definition });

    return () => {
      this.entries.delete(token);
    };
  }

  async expand(
    html: string,
    context: BlockRenderContext = { content: null },
  ): Promise<string> {
    if (!this.entries.size || !html.includes('[')) return html;

    const cache = new Map<object, Map<string, Promise<string | null>>>();
    const encoder = new TextEncoder();
    let calls = 0;
    let bytes = 0;
    let exhausted = false;
    const maxOutput = 2 * 1024 * 1024;

    if (encoder.encode(html).length > 1024 * 1024) return html;

    const render = async (text: string, depth: number): Promise<string> => {
      if (depth >= 8) return text;

      return customShortcodes(text, {
        has: (tag) =>
          tag === undefined
            ? this.entries.size > 0
            : [...this.entries.values()].some((entry) => entry.tag === tag),
        convert: async (tag, attrs, inner) => {
          if (exhausted || bytes >= maxOutput || ++calls > 1000) return null;

          const entry = [...this.entries]
            .reverse()
            .find(([, value]) => value.tag === tag);

          if (!entry) return null;

          const [token, { definition }] = entry;
          let outputs = cache.get(token);

          if (!outputs) {
            outputs = new Map();
            cache.set(token, outputs);
          }

          const key = JSON.stringify([tag, attrs, inner, depth]);
          let output = outputs.get(key);

          if (!output) {
            output = (async () => {
              const nested = await render(inner, depth + 1);

              if (exhausted || bytes >= maxOutput) return null;

              const result = await isolate(
                () =>
                  definition.render(
                    structuredClone(attrs),
                    nested,
                    structuredClone({
                      content: context.content
                        ? {
                            id: context.content.id,
                            type: context.content.type,
                            slug: context.content.slug,
                          }
                        : null,
                    }),
                  ),
                this.timeoutMs,
              );
              const parsed = result.ok
                ? shortcodeOutputSchema.safeParse(result.value)
                : null;

              if (!this.entries.has(token) || !parsed?.success) return null;

              if (bytes + encoder.encode(parsed.data).length > maxOutput) {
                exhausted = true;

                return null;
              }

              return sanitizeShortcodeHtml(parsed.data);
            })().catch(() => null);
            outputs.set(key, output);
          }

          const value = await output;

          if (!this.entries.has(token) || value === null) return null;

          bytes += encoder.encode(value).length;

          if (bytes > maxOutput) {
            exhausted = true;

            return null;
          }

          return value;
        },
      });
    };

    return mapContentText(html, async (text) => {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const output = await render(escaped, 0);

      return output === escaped ? text : output;
    }).catch(() => html);
  }
}
