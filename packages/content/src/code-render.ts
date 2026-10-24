import { createHighlighter } from 'shiki';
import type { BundledTheme } from 'shiki';
import type { Node } from '@tiptap/pm/model';
import { codeLanguage } from '@cms/sdk/code-block';
import {
  CODE_LANGUAGES,
  CODE_THEMES,
  codeBlockAttributesSchema,
  highlightedRows,
  shikiThemeId,
} from '@cms/sdk/code-block';

const themeId = (theme: string) => shikiThemeId(theme) as BundledTheme;
const highlighter = await createHighlighter({
  themes: CODE_THEMES.map(themeId),
  langs: [...CODE_LANGUAGES],
});
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (value) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[value]!,
  );

export const renderCodeBlock = (
  code: string,
  raw: Record<string, unknown>,
): string => {
  const parsed = codeBlockAttributesSchema.safeParse(raw);
  const attrs = parsed.success
    ? parsed.data
    : codeBlockAttributesSchema.parse({});
  const marked = highlightedRows(attrs.highlightLines);
  let tokens: ReturnType<typeof highlighter.codeToTokens> | null = null;
  try {
    if (new TextEncoder().encode(code).length <= 100_000)
      tokens = highlighter.codeToTokens(code, {
        lang: parsed.success ? codeLanguage(attrs.language) : 'text',
        ...(attrs.theme
          ? { theme: themeId(attrs.theme) }
          : {
              themes: { light: 'github-light', dark: 'github-dark' },
              defaultColor: false,
            }),
      });
  } catch {
    // Grammar failures must not prevent saving otherwise valid content.
  }
  const lines = code
    .split('\n')
    .map((line, index) => {
      const body = tokens
        ? tokens.tokens[index]!.map(
            (token) =>
              `<span style="${escape(
                token.htmlStyle
                  ? Object.entries(token.htmlStyle)
                      .map(([key, value]) => `${key}:${value}`)
                      .join(';')
                  : `color:${token.color ?? 'inherit'};${(token.fontStyle ?? 0) & 1 ? 'font-style:italic;' : ''}${(token.fontStyle ?? 0) & 2 ? 'font-weight:bold;' : ''}`,
              )}">${escape(token.content)}</span>`,
          ).join('')
        : escape(line);
      const highlighted = marked(index + 1);
      return `<span class="cms-code-line${highlighted ? ' is-highlighted' : ''}">${attrs.lineNumbers ? `<span aria-hidden="true" class="cms-code-number" data-line="${attrs.startLine + index}"></span>` : ''}${body}</span>`;
    })
    .join('\n');
  const language =
    typeof raw.language === 'string' && raw.language
      ? ` class="language-${escape(raw.language)}"`
      : '';
  return `<figure class="cms-code not-prose${attrs.theme ? '' : ' cms-code-auto'}"${tokens && attrs.theme ? ` style="background:${escape(tokens.bg ?? '')};color:${escape(tokens.fg ?? '')}"` : ''}>${attrs.label ? `<figcaption>${escape(attrs.label)}</figcaption>` : ''}${attrs.copyButton ? '<button type="button" data-code-copy hidden></button><span class="sr-only" role="status"></span>' : ''}<pre tabindex="0"><code${language}>${lines}</code></pre></figure>`;
};

export const codeBlockNodeMapping = {
  codeBlock: ({ node }: { node: Node }) =>
    renderCodeBlock(node.textContent, node.attrs),
};
