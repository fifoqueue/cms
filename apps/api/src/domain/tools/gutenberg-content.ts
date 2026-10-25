import { CALLOUT_VARIANTS } from '@cms/sdk';
import { codeLanguage } from '@cms/sdk/code-block';

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** One replacement pass: decoded ampersands must never start another decode. */
const decode = (value: string) =>
  value.replace(
    /&(#(?:[xX][0-9a-fA-F]+|\d+)|amp|lt|gt|quot|apos|nbsp);/g,
    (_, entity: string) => {
      if (!entity.startsWith('#')) return ENTITIES[entity]!;
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point === 0 ||
        point > 0x10ffff ||
        (point >= 0xd800 && point <= 0xdfff)
        ? '\ufffd'
        : String.fromCodePoint(point);
    },
  );

/**
 * Read the exported block attributes, not syntax-highlighter decoration.
 * Unknown blocks and malformed attributes retain their original HTML.
 * The shared HTML parser remains the validation and sanitization boundary.
 */
export const gutenbergHtml = (html: string): string =>
  html.replace(
    /<!-- wp:(kevinbatdorf\/code-block-pro|simple-alerts-for-gutenberg\/alert-boxes)\s+(\{[\s\S]*?\})\s*-->([\s\S]*?)<!-- \/wp:\1\s*-->/g,
    (original: string, name: string, source: string) => {
      let attrs: Record<string, unknown>;
      try {
        const value: unknown = JSON.parse(source);
        if (!value || typeof value !== 'object' || Array.isArray(value))
          return original;
        attrs = value as Record<string, unknown>;
      } catch {
        return original;
      }
      if (name === 'kevinbatdorf/code-block-pro') {
        if (typeof attrs.code !== 'string') return original;
        return `<pre data-code-language="${codeLanguage(typeof attrs.language === 'string' ? decode(attrs.language) : attrs.language)}" data-code-linenumbers="${attrs.lineNumbers === true}"><code>${escape(decode(attrs.code))}</code></pre>`;
      }
      if (typeof attrs.content !== 'string') return original;
      const variant =
        CALLOUT_VARIANTS.find(
          (value) =>
            value ===
            (typeof attrs.alert_type === 'string'
              ? decode(attrs.alert_type)
              : attrs.alert_type),
        ) ?? 'info';
      // Content is already HTML: the shared parser decodes its text entities once.
      // Decoding here would turn escaped markup into elements and double-decode text.
      return `<aside class="cms-callout cms-callout-${variant}"><div class="cms-callout-body">${attrs.content}</div></aside>`;
    },
  );
