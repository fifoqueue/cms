import { describe, expect, test } from 'bun:test';
import { InvalidDocumentError } from './extensions';
import { renderDocument } from './render';

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
