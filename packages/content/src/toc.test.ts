import { expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { contentExtensions } from '#content/extensions';
import { TableOfContents, renderWithToc } from '#content/toc';
import type { AutoTocOptions } from '#content/toc';

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

test('automatic TOCs respect policy, manual blocks and page-local minimums', () => {
  const heading = {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'Section' }],
  };
  const content = [heading, heading, heading];
  const render = (options: AutoTocOptions, nodes = content) =>
    renderWithToc(
      getSchema(extensions).nodeFromJSON({ type: 'doc', content: nodes }),
      extensions,
      {},
      options,
    );
  for (const enabled of [false, true]) {
    for (const override of ['default', 'always', 'never'] as const) {
      expect(
        render({ enabled, override }).includes('nav class="cms-toc"'),
      ).toBe(override === 'always' || (override === 'default' && enabled));
    }
  }
  expect(render({ enabled: true }, [heading, heading])).not.toContain('<nav');
  const manual = getSchema(extensions).nodeFromJSON({
    type: 'doc',
    content: [{ type: 'tableOfContents' }, ...content],
  });
  expect(
    renderWithToc(manual, extensions, {}, { enabled: true }).match(/<nav /g),
  ).toHaveLength(1);
  const paged = getSchema(extensions).nodeFromJSON({
    type: 'doc',
    content: [...content, { type: 'pageBreak' }, ...content],
  });
  const html = renderWithToc(paged, extensions, {}, { enabled: true });
  expect(html.match(/<nav /g)).toHaveLength(2);
  expect(html).toContain('href="#section-4"');
  expect(html).toContain('id="section-4"');
});
