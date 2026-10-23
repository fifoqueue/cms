import { LINK } from '@cms/sdk';
import type { RichRun } from '@cms/sdk';

/** `[text](address)`, `**bold**` or `*italic*`; everything else is literal text. */
const TOKEN =
  /\[([^\]\n]{1,200})\]\(([^()\s]{1,2048})\)|\*\*([^*\n]{1,2000})\*\*|\*([^*\n]{1,2000})\*/g;

const run = (text: string, marks: Partial<RichRun> = {}): RichRun => ({
  text,
  strong: false,
  em: false,
  href: null,
  ...marks,
});

/**
 * Widget text with a small, safe formatting subset (WordPress Text widget without HTML):
 * paragraphs split at blank lines, `**bold**`, `*italic*` and links whose address passes
 * `LINK`. Nothing becomes markup: the result is plain runs the theme renders as text.
 */
export const richText = (source: string): RichRun[][] =>
  source
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const runs: RichRun[] = [];
      let last = 0;
      for (const match of paragraph.matchAll(TOKEN)) {
        const [whole, label, href, strong, em] = match;
        if (match.index > last)
          runs.push(run(paragraph.slice(last, match.index)));
        if (label !== undefined)
          runs.push(
            LINK.test(href!) ? run(label, { href: href! }) : run(whole),
          );
        else if (strong !== undefined) runs.push(run(strong, { strong: true }));
        else runs.push(run(em!, { em: true }));
        last = match.index + whole.length;
      }
      if (last < paragraph.length) runs.push(run(paragraph.slice(last)));
      return runs;
    });
