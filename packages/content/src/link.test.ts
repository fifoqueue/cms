import { expect, test } from 'bun:test';
import { generateHTML } from '@tiptap/html/server';
import { contentExtensions } from '#content/extensions';
import { linkMarkAttributes } from '#content/link';
import { parseHtml } from '#content/parse';
import { renderDocument } from '#content/render';

const linked = (attrs: Record<string, unknown>) => ({
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs }] }],
    },
  ],
});

test('links carry only the target and rel their source or author set', () => {
  const document = parseHtml(
    '<p><a href="/about">plain</a> <a href="https://example.com" target="_BLANK" rel="UGC noopener nofollow bogus">new tab</a> <a href="/ad" target="frame" rel="sponsored">ad</a></p>',
  );
  const html = renderDocument(document);

  expect(html).toContain('<a href="/about">plain</a>');
  expect(html).toContain(
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow ugc">new tab</a>',
  );
  expect(html).toContain('<a href="/ad" rel="sponsored">ad</a>');

  const chosen = renderDocument(
    linked({ href: '/a', ...linkMarkAttributes({ newTab: false, rel: [] }) }),
  );

  expect(chosen).toBe('<p><a href="/a">x</a></p>');
});

test('the editor serializes links exactly as the server renders them', () => {
  const document = linked({
    href: '/a',
    ...linkMarkAttributes({ newTab: true, rel: ['sponsored', 'nofollow'] }),
  });

  expect(generateHTML(document, contentExtensions)).toBe(
    renderDocument(document),
  );
  expect(renderDocument(document)).toBe(
    '<p><a href="/a" target="_blank" rel="noopener noreferrer nofollow sponsored">x</a></p>',
  );
});
