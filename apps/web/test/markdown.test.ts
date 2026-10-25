// The `/<slug>.md` alternate: footnotes become Markdown footnotes without escaping gaps.
import { expect, test } from 'bun:test';
import { htmlToMarkdown } from '#lib/server/markdown.js';

const BASE = 'https://example.com/post';
const ref = (page: number, n: number) =>
  `<sup id="fn-ref-${page}-${n}"><a data-footnote-ref href="#fn-${page}-${n}" aria-label="Footnote ${n}">${n}</a></sup>`;
const notes = (page: number, texts: string[]) =>
  `<section class="cms-footnotes"><ol>${texts
    .map(
      (text, index) =>
        `<li id="fn-${page}-${index + 1}"><span>${text}</span> <a href="#fn-ref-${page}-${index + 1}" aria-label="Back to reference ${index + 1}">↩</a></li>`,
    )
    .join('')}</ol></section>`;
const PAGE_BREAK = '<div class="cms-nextpage" data-cms-nextpage="true"></div>';

test('footnote references and definitions use Markdown footnote syntax', () => {
  const html = `<p>One${ref(1, 1)} and two${ref(1, 2)}.</p>${notes(1, ['First note', 'Second note'])}`;
  expect(htmlToMarkdown(html, BASE)).toBe(
    'One[^1] and two[^2].\n\n[^1]: First note\n[^2]: Second note',
  );
});

test('labels stay unique across pages because numbering restarts per page', () => {
  const html = `<p>A${ref(1, 1)}</p>${notes(1, ['Page one'])}${PAGE_BREAK}<p>B${ref(2, 1)}</p>${notes(2, ['Page two'])}`;
  expect(htmlToMarkdown(html, BASE)).toBe(
    'A[^1]\n\nB[^p2-1]\n\n[^1]: Page one\n[^p2-1]: Page two',
  );
});

test('footnote text cannot inject links, raw HTML or block markup', () => {
  const text =
    '# [x](https://evil.example) &lt;img src=x onerror=alert(1)&gt; [^9]: *y*\n- z';
  const markdown = htmlToMarkdown(
    `<p>A${ref(1, 1)}</p>${notes(1, [text])}`,
    BASE,
  );
  const definition = markdown.split('\n').at(-1);
  expect(definition).toBe(
    '[^1]: \\# \\[x\\](https://evil.example) \\<img src=x onerror=alert(1)\\> \\[^9\\]: \\*y\\* - z',
  );
  expect(markdown).not.toContain('↩');
});

test('footnote text that starts like block markup is escaped', () => {
  const cases: [string, string][] = [
    ['# Heading', '\\# Heading'],
    ['- item', '\\- item'],
    ['+ item', '\\+ item'],
    ['* item', '\\* item'],
    ['&gt; quote', '\\> quote'],
    ['1. item', '1\\. item'],
    ['1) item', '1\\) item'],
    ['---', '\\---'],
    ['===', '\\==='],
    ['```js', '\\`\\`\\`js'],
    ['~~~', '\\~\\~\\~'],
  ];
  for (const [text, escaped] of cases)
    expect(
      htmlToMarkdown(`<p>A${ref(1, 1)}</p>${notes(1, [text])}`, BASE),
    ).toBe(`A[^1]\n\n[^1]: ${escaped}`);
});

test('a list item whose reference was removed stays as plain text', () => {
  const html = `<p>A${ref(1, 1)}</p>${notes(1, ['Kept', '# Orphaned'])}`;
  expect(htmlToMarkdown(html, BASE)).toBe(
    'A[^1]\n\n\\# Orphaned\n\n[^1]: Kept',
  );
});

test('a reference without a matching item keeps its visible number', () => {
  const mismatched = `<sup id="fn-ref-1-1"><a data-footnote-ref href="#fn-1-1x" aria-label="Footnote 1">1</a></sup>`;
  expect(
    htmlToMarkdown(`<p>A${mismatched}</p>${notes(1, ['Note'])}`, BASE),
  ).toBe('A1\n\nNote');
  expect(htmlToMarkdown(`<p>A${ref(1, 2)}</p>`, BASE)).toBe('A2');
});

test('an orphan list item is kept as escaped content, not a definition', () => {
  const html = `<p>A${ref(1, 1)}</p><section class="cms-footnotes"><ol><li id="fn-1-1"><span>Real</span> <a href="#fn-ref-1-1">↩</a></li><li id="fn-1-1x"><span>[Loose](https://evil.example)</span> <a href="#fn-ref-1-1x">↩</a></li></ol></section>`;
  expect(htmlToMarkdown(html, BASE)).toBe(
    'A[^1]\n\n\\[Loose\\](https://evil.example)\n\n[^1]: Real',
  );
});

test('superscripts that are not footnote references keep their text', () => {
  expect(htmlToMarkdown('<p>x<sup>2</sup></p>', BASE)).toBe('x2');
});
