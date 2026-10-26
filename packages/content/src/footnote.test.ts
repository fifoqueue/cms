import { expect, test } from 'bun:test';
import { renderDocument } from '#content/render';
import { parseDocument } from '#content/extensions';
import { plainText } from '#content/plain-text';
import { parseHtml } from '#content/parse';
import { PAGE_BREAK_HTML } from '#content/breaks';
import { collectFootnotes, parseFootnote } from '@cms/sdk/footnotes';

const note = (text: string) => ({ type: 'footnote', attrs: { text } });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });

test('footnotes validate plain text and exclude it from summaries', () => {
  for (const text of ['', ' ', 'x'.repeat(2001)])
    expect(() =>
      parseDocument({ type: 'doc', content: [paragraph(note(text))] }),
    ).toThrow();
  expect(() =>
    parseDocument({
      type: 'doc',
      content: [
        paragraph({ type: 'footnote', attrs: { text: 'ok', url: '/' } }),
      ],
    }),
  ).toThrow();
  expect(
    plainText({
      type: 'doc',
      content: [paragraph({ type: 'text', text: 'Body' }, note('Hidden'))],
    }),
  ).toBe('Body');
});

test('footnotes escape text and render page-local lists alongside automatic TOCs', () => {
  const html = renderDocument(
    {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, anchor: 'fn-1-1' },
          content: [{ type: 'text', text: 'Heading' }],
        },
        paragraph(note('<script>&"'), note('Second')),
        { type: 'pageBreak' },
        paragraph(note('Next')),
      ],
    },
    { enabled: true, attrs: { minHeadings: 1 } },
  );
  expect(html).toContain('id="heading-fn-1-1"');
  expect(html).toContain('class="cms-toc"');
  expect(html).toContain('id="fn-ref-1-2"');
  expect(html).toContain('href="#fn-ref-2-1"');
  expect(html).toContain('id="fn-2-1"');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;&amp;&quot;');
  expect(html.match(/class="cms-footnotes"/g)).toHaveLength(2);
});

const named = (name: string, text = '') => ({
  type: 'footnote',
  attrs: { name, text },
});

test('footnote shortcuts parse like the board: names, reuses and anonymous notes', () => {
  expect(parseFootnote('[*이름 ㅁㅁㅁ]')).toEqual({
    name: '이름',
    text: 'ㅁㅁㅁ',
  });
  expect(parseFootnote('[*이름]')).toEqual({ name: '이름', text: '' });
  expect(parseFootnote('[* text ]')).toEqual({ text: 'text' });
  for (const source of [
    '[* ]',
    '[*a [b]]',
    '[*a\nb]',
    '[a]',
    `[* ${'x'.repeat(2001)}]`,
  ])
    expect(parseFootnote(source)).toBeNull();
  const groups = collectFootnotes(
    [
      { name: 'a' },
      { text: 'same' },
      { name: 'a', text: 'later' },
      { text: 'same' },
      // The node's default empty name is anonymous: never merged, text kept.
      { name: '', text: 'same' },
      { name: '', text: 'other' },
    ].map((source) => ({ text: '', ...source })),
  );
  expect(groups).toEqual([
    { label: 'a', text: 'later', references: [0, 2] },
    { label: '2', text: 'same', references: [1] },
    { label: '3', text: 'same', references: [3] },
    { label: '4', text: 'same', references: [4] },
    { label: '5', text: 'other', references: [5] },
  ]);
});

test('footnote names validate, survive reloads and keep old anonymous notes', () => {
  const doc = (...notes: object[]) => ({
    type: 'doc' as const,
    content: [paragraph(...notes)],
  });
  for (const attrs of [
    { name: '', text: '' },
    { name: 'a b', text: 'x' },
    { name: 'a]', text: 'x' },
    { name: 'a\n', text: '' },
    { name: 'x'.repeat(2001), text: '' },
    { name: 'a', text: ' ' },
    { name: 'a', text: 'x'.repeat(2001) },
  ])
    expect(() => parseDocument(doc({ type: 'footnote', attrs }))).toThrow();
  const stored = doc(named('이름', 'ㅁㅁㅁ'), named('이름'));
  expect(parseDocument(stored).toJSON()).toMatchObject(stored);
  expect(parseDocument(doc(note('old'))).toJSON()).toMatchObject(
    doc(named('', 'old')),
  );
  expect(
    parseHtml(
      '<p>a<sup data-footnote="" data-footnote-name="이름">*</sup><sup data-footnote="ㅁ" data-footnote-name="이름">*</sup></p>',
    ),
  ).toMatchObject(
    doc({ type: 'text', text: 'a' }, named('이름'), named('이름', 'ㅁ')),
  );
  expect(() =>
    parseHtml('<p>a<sup data-footnote="" data-footnote-name="a b">*</sup></p>'),
  ).toThrow();
});

test('named footnotes share one page-local item with a back link per reference', () => {
  const html = renderDocument({
    type: 'doc',
    content: [
      paragraph(
        named('a<"'),
        note('dup'),
        named('a<"', '<b>note</b>'),
        named('', 'dup'),
      ),
      { type: 'pageBreak' },
      paragraph(named('a<"'), named('solo', 'only'), named('a<"', 'second')),
    ],
  });
  const [first, second] = html.split(PAGE_BREAK_HTML);
  expect(first).toContain(
    '<sup id="fn-ref-1-1-1"><a data-footnote-ref data-footnote-label="a&lt;&quot;" href="#fn-1-1" aria-label="Footnote a&lt;&quot;">a&lt;&quot;</a></sup>',
  );
  expect(first).toContain(
    '<sup id="fn-ref-1-1-2"><a data-footnote-ref data-footnote-label="a&lt;&quot;" href="#fn-1-1"',
  );
  expect(first).toContain(
    '<li id="fn-1-1" data-footnote-label="a&lt;&quot;"><span>&lt;b&gt;note&lt;/b&gt;</span> <span data-footnote-group>[a&lt;&quot;]</span> <a data-footnote-back data-footnote-label="1.1" href="#fn-ref-1-1-1" aria-label="Back to reference 1.1">1.1</a> <a data-footnote-back data-footnote-label="1.2" href="#fn-ref-1-1-2" aria-label="Back to reference 1.2">1.2</a></li>',
  );
  expect(first).toContain(
    '<li id="fn-1-2" data-footnote-label="2"><span>dup</span> <a data-footnote-back data-footnote-label="2" href="#fn-ref-1-2" aria-label="Back to reference 2">[2]</a></li>',
  );
  expect(first).toContain(
    '<li id="fn-1-3" data-footnote-label="3"><span>dup</span>',
  );
  expect(first).not.toContain('<b>');
  // A later page lists its own copy of the note, numbered from 1 again, with the
  // document's first definition even where the page defines the name differently.
  expect(second).toContain(
    '<li id="fn-2-1" data-footnote-label="a&lt;&quot;"><span>&lt;b&gt;note&lt;/b&gt;</span> <span data-footnote-group>[a&lt;&quot;]</span> <a data-footnote-back data-footnote-label="1.1" href="#fn-ref-2-1-1"',
  );
  expect(second).toContain('href="#fn-ref-2-1-2"');
  expect(second).not.toContain('second');
  expect(second).toContain('id="fn-ref-2-2"');
  expect(second).toContain(
    '<li id="fn-2-2" data-footnote-label="solo"><span>only</span>',
  );
});
