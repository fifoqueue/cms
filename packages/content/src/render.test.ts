import { describe, expect, test } from 'bun:test';
import { InvalidDocumentError } from '#content/extensions';
import { parseHtml } from '#content/parse';
import { renderDocument } from '#content/render';

const paragraph = (text: string, marks?: unknown[]) => ({
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
    },
  ],
});

describe('renderDocument', () => {
  test('renders headings and marks', () => {
    const html = renderDocument({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }],
        },
      ],
    });
    // Accept the pre-wiring renderer too; TOC tests assert the generated id exactly.
    expect(html).toMatch(/<h2(?: id="title")?>Title<\/h2>/);
    expect(html).toContain('<strong>bold</strong>');
  });

  test('escapes text', () => {
    expect(
      renderDocument(paragraph('<script>alert(1)</script>')),
    ).not.toContain('<script>');
  });

  test('drops unsafe link protocols', () => {
    const html = renderDocument(
      paragraph('x', [
        { type: 'link', attrs: { href: 'javascript:alert(1)' } },
      ]),
    );
    expect(html).not.toContain('javascript:');
  });

  test('documents written by the previous schema still render', () => {
    // Tiptap parsed attribute text into scalars (alt="2024" became a number); stored JSON kept it.
    const html = renderDocument({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'c#' },
          content: [{ type: 'text', text: 'int x;' }],
        },
        {
          type: 'image',
          attrs: { src: '/media/a.png', alt: 2024, width: '100%', extra: 1 },
        },
        { type: 'video', attrs: { src: '/media/x.mp4', onerror: 'alert(1)' } },
        {
          type: 'orderedList',
          attrs: { start: 0, type: 'disc' },
          content: [{ type: 'listItem', content: [paragraph('x').content[0]] }],
        },
        paragraph('report', [
          { type: 'link', attrs: { href: '/r', target: 'report', rel: 'UGC' } },
        ]).content[0]!,
      ],
    });
    expect(html).toContain('class="language-c#"');
    expect(html).toContain('target="report"');
    expect(html).toContain('alt="2024"');
    // Unknown attributes are dropped, never rendered.
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('extra');
  });

  test('rejects nodes outside the schema', () => {
    expect(() =>
      renderDocument({ type: 'doc', content: [{ type: 'iframe' }] }),
    ).toThrow(InvalidDocumentError);
  });
});

describe('media and embeds', () => {
  const doc = (node: Record<string, unknown>) => ({
    type: 'doc' as const,
    content: [node],
  });

  test('images render only safe sources and keep the media id', () => {
    const media = renderDocument(
      doc({
        type: 'image',
        attrs: { src: '/media/2026/10/a.webp', alt: 'A', mediaId: 'm1' },
      }),
    );
    expect(media).toContain('src="/media/2026/10/a.webp"');
    expect(media).toContain('data-media-id="m1"');
    for (const src of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '//evil.example/a.png',
      '/media/../etc/passwd',
      'http://example.com/a.png',
    ])
      expect(
        renderDocument(doc({ type: 'image', attrs: { src } })),
      ).not.toContain('src=');
  });

  test('embeds become plain https links', () => {
    expect(
      renderDocument(
        doc({ type: 'embed', attrs: { url: 'https://youtu.be/abc' } }),
      ),
    ).toContain('data-embed-url="https://youtu.be/abc"');
    expect(
      renderDocument(doc({ type: 'embed', attrs: { url: 'javascript:x' } })),
    ).not.toContain('javascript');
  });
});

test('block attributes reject injected structure and escape captions, citations and download labels', () => {
  const unsafe = '<img src=x onerror=alert(1)>';
  const document = {
    type: 'doc' as const,
    content: [
      {
        type: 'image',
        attrs: {
          src: '/media/photo.webp',
          caption: unsafe,
          align: 'wide',
          href: 'javascript:alert(1)',
          mediaId: 'image',
        },
      },
      {
        type: 'video',
        attrs: {
          src: '/media/movie.mp4',
          caption: unsafe,
          poster: 'javascript:alert(1)',
          mediaId: 'video',
        },
      },
      {
        type: 'file',
        attrs: { src: '/media/report.pdf', name: unsafe, mediaId: 'file' },
      },
      {
        type: 'buttons',
        content: [
          {
            type: 'button',
            attrs: { href: 'javascript:alert(1)' },
            content: [{ type: 'text', text: unsafe }],
          },
        ],
      },
      {
        type: 'pullquote',
        attrs: { cite: unsafe },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] },
        ],
      },
    ],
  };
  const html = renderDocument(document);
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('javascript:');
  expect(html).toContain('&lt;img');
  for (const id of ['image', 'video', 'file'])
    expect(html).toContain(`data-media-id="${id}"`);
  for (const node of [
    {
      type: 'image',
      attrs: { src: '/media/x.webp', align: 'center;position:fixed' },
    },
    { type: 'file', attrs: { name: { toString: 'x' } } },
    { type: 'gallery', attrs: { columns: -1 }, content: [{ type: 'image' }] },
    { type: 'paragraph', attrs: { textAlign: 'left;color:red' } },
    { type: 'spacer', attrs: { height: '100vh' } },
    {
      type: 'columns',
      content: [{ type: 'column', content: [{ type: 'paragraph' }] }],
    },
  ])
    expect(() => renderDocument({ type: 'doc', content: [node] })).toThrow(
      InvalidDocumentError,
    );
  expect(() =>
    renderDocument({
      type: 'doc',
      content: Array.from({ length: 10001 }, () => ({ type: 'paragraph' })),
    }),
  ).toThrow(InvalidDocumentError);
});

test('WordPress core block HTML keeps its structure and attributes through import and rendering', () => {
  const document = parseHtml(`
    <!-- wp:image {"align":"wide"} -->
    <figure class="wp-block-image alignwide"><a href="/about" target="_blank"><img src="https://example.com/a.webp" alt="A"></a><figcaption>Image caption</figcaption></figure>
    <!-- /wp:image -->
    <figure class="wp-block-gallery columns-2 is-cropped"><figure class="wp-block-image"><img src="/media/one.webp"><figcaption>First</figcaption></figure><figure class="wp-block-image"><img src="/media/two.webp"></figure><figcaption>Gallery caption</figcaption></figure>
    <div class="wp-block-columns"><div class="wp-block-column"><p style="text-align:center">Left</p></div><div class="wp-block-column"><h2 id="right" class="has-text-align-right">Right</h2></div></div>
    <div class="wp-block-buttons is-content-justification-center"><div class="wp-block-button is-style-outline"><a class="wp-block-button__link" href="mailto:hello@example.com">Contact</a></div></div>
    <figure class="wp-block-video"><video src="/media/movie.webm" controls></video><figcaption>Video caption</figcaption></figure>
    <div class="wp-block-file"><a href="/media/report.pdf">Report</a><a href="/media/report.pdf" download>Download</a></div>
    <details class="wp-block-details" open><summary>More</summary><p>Details body</p></details>
    <figure class="wp-block-pullquote"><blockquote><p>Quotation</p><cite>Writer</cite></blockquote></figure>
    <hr class="wp-block-separator"><div class="wp-block-spacer" style="height:80px" aria-hidden="true"></div>
    <figure class="wp-block-table"><table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table><figcaption>Table caption</figcaption></figure>
  `);
  expect(document.content?.map((node) => node.type)).toEqual([
    'image',
    'gallery',
    'columns',
    'buttons',
    'video',
    'file',
    'details',
    'pullquote',
    'horizontalRule',
    'spacer',
    'table',
  ]);
  expect(document.content?.[0]?.attrs).toMatchObject({
    caption: 'Image caption',
    align: 'wide',
    href: '/about',
    newTab: true,
  });
  expect(document.content?.[1]?.attrs).toMatchObject({
    columns: 2,
    crop: true,
    caption: 'Gallery caption',
  });
  expect(document.content?.[6]?.attrs).toMatchObject({ open: true });
  expect(document.content?.[7]?.attrs).toMatchObject({ cite: 'Writer' });
  expect(document.content?.[9]?.attrs).toMatchObject({ height: 80 });
  expect(document.content?.[10]?.attrs).toMatchObject({
    caption: 'Table caption',
  });
  const html = renderDocument(document);
  expect(html).toContain('cms-text-center');
  expect(html).toContain('data-variant="outline"');
  expect(html).toContain('<th>');
  expect(html).toContain('<caption>Table caption</caption>');
  expect(parseHtml(html)).toEqual(document);
});

const doc = (...content: unknown[]) =>
  ({ type: 'doc', content }) as Parameters<typeof renderDocument>[0];

test('teaser, page breaks and pattern references render as markers, breaks only at the top level', () => {
  const html = renderDocument(
    doc(
      { type: 'more' },
      { type: 'patternRef', attrs: { ref: 'pattern-1' } },
      { type: 'pageBreak' },
    ),
  );
  expect(html).toBe(
    '<div class="cms-more" data-cms-more="true"></div><div class="cms-pattern" data-cms-pattern="pattern-1"></div><div class="cms-nextpage" data-cms-nextpage="true"></div>',
  );
  expect(() =>
    renderDocument(
      doc({ type: 'blockquote', content: [{ type: 'pageBreak' }] }),
    ),
  ).toThrow();
  expect(() =>
    renderDocument(doc({ type: 'patternRef', attrs: { ref: '"><script>' } })),
  ).toThrow();
});
