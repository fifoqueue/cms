import { describe, expect, test } from 'bun:test';
import { InvalidDocumentError } from '#content/extensions';
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
    expect(html).toContain('<h2>Title</h2>');
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
