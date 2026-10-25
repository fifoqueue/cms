import { expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { contentExtensions } from '#content/extensions';
import { TableOfContents, renderWithToc } from '#content/toc';

const extensions = [
  ...contentExtensions.filter(
    (extension) => extension.name !== 'tableOfContents',
  ),
  TableOfContents,
];

test('TOC titles are escaped', () => {
  const doc = getSchema(extensions).nodeFromJSON({
    type: 'doc',
    content: [
      { type: 'tableOfContents', attrs: { title: '<Contents>' } },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '한글' }],
      },
    ],
  });
  expect(renderWithToc(doc, extensions)).toContain(
    'aria-label="&lt;Contents&gt;"',
  );
});
