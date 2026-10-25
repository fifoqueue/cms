import { expect, test } from 'bun:test';
import { renderDocument } from '#content/render';
import { parseDocument } from '#content/extensions';
import { plainText } from '#content/plain-text';

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
