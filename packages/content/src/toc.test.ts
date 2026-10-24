import { expect, test } from 'bun:test';
import {
  collectHeadings,
  tocDefaults,
  tocHTML,
  tocOutline,
  tocPage,
  TableOfContents,
  renderWithToc,
} from '#content/toc';
import { contentExtensions } from '#content/extensions';
import { getSchema, Node } from '@tiptap/core';
import { validTocCount, HeadingAnchor, parseTocAttrs } from '#content/toc';

const extensions = [
  ...contentExtensions.filter(
    (extension) => extension.name !== 'tableOfContents',
  ),
  TableOfContents,
];

const heading = (text: string, level = 2) => ({
  type: 'heading',
  attrs: { level },
  content: text ? [{ type: 'text', text }] : [],
});
test('document bound rejects large TOC amplification and allows three', () => {
  const toc = { type: 'tableOfContents' };
  expect(validTocCount({ type: 'doc', content: Array(3300).fill(toc) })).toBe(
    false,
  );
  expect(validTocCount({ type: 'doc', content: Array(3).fill(toc) })).toBe(
    true,
  );
});
test('anchors, reserved names, level clamping and cached positions', () => {
  const doc = getSchema([...extensions, HeadingAnchor]).nodeFromJSON({
    type: 'doc',
    content: [
      { ...heading('Label', 9), attrs: { level: 9, anchor: 'main' } },
      heading('comment-1'),
      heading('moderate-2'),
      heading('comments'),
    ],
  });
  const result = collectHeadings(doc);
  expect(collectHeadings(doc)).toBe(result);
  expect(result[0]?.level).toBe(2);
  expect(result[0]?.id).toBe('main-heading');
  expect(result.every((h) => !/^(comment-|moderate-)/.test(h.id))).toBe(true);
});
test('serialized settings parse with bounded fallbacks', () => {
  const attrs = { ...tocDefaults, title: '목차', excluded: ['a'], open: false };
  const element = (value: string) =>
    ({ getAttribute: () => value }) as unknown as HTMLElement;
  expect(parseTocAttrs(element(JSON.stringify(attrs)))).toEqual(attrs);
  expect(parseTocAttrs(element('invalid'))).toEqual(tocDefaults);
  expect(parseTocAttrs(element('{"minHeadings":101}')).minHeadings).toBe(0);
});
test('Unicode, duplicates, empty headings and suffix collisions', () => {
  expect(
    collectHeadings({
      type: 'doc',
      content: [
        heading('한글'),
        heading('한글'),
        heading(''),
        heading('한글-2'),
      ],
    }).map((h) => h.id),
  ).toEqual(['한글', '한글-2', '한글-2-2']);
});
test('skipped levels, exclusions and threshold', () => {
  const headings = collectHeadings({
    type: 'doc',
    content: [heading('A'), heading('B', 4)],
  });
  expect(tocOutline(headings, tocDefaults, 1)[0]?.children[0]?.id).toBe('b');
  expect(tocHTML(headings, { ...tocDefaults, minHeadings: 3 }, 1)).toBe('');
  expect(
    tocHTML(headings, { ...tocDefaults, excluded: ['a'] }, 1),
  ).not.toContain('href="#a"');
});
test('multiple TOCs, escaped HTML, page-local links and document-wide IDs', () => {
  const doc = getSchema(extensions).nodeFromJSON({
    type: 'doc',
    content: [
      { type: 'tableOfContents', attrs: { title: '<Contents>' } },
      { type: 'tableOfContents' },
      heading('한글'),
      { type: 'pageBreak' },
      { type: 'tableOfContents' },
      heading('한글'),
    ],
  });
  const html = renderWithToc(doc, extensions);
  expect(html.match(/<nav /g)?.length).toBe(3);
  expect(html).toContain('aria-label="&lt;Contents&gt;"');
  expect(html).toContain('<details open>');
  expect(html).toContain('id="한글-2"');
  const pages = html.split(
    '<div class="cms-nextpage" data-cms-nextpage="true"></div>',
  );
  expect(pages[0]).not.toContain('#한글-2');
  expect(pages[1]).toContain('href="#한글-2"');
});

test('localized stored titles, empty-title fallback, closed and noncollapsible output', () => {
  const headings = collectHeadings({ type: 'doc', content: [heading('A')] });
  expect(
    tocHTML(headings, { ...tocDefaults, title: '목차', open: false }, 1),
  ).toContain('<details><summary>목차</summary>');
  const plain = tocHTML(headings, { ...tocDefaults, collapsible: false }, 1);
  expect(plain).toContain('aria-label="Contents"');
  expect(plain).not.toContain('<details');
  expect(tocHTML(headings, { ...tocDefaults, levels: [] }, 1)).toBe('');
  expect(
    tocHTML(headings, { ...tocDefaults, excluded: ['a'], minHeadings: 1 }, 1),
  ).toBe('');
  expect(tocHTML([], tocDefaults, 1)).toBe('');
});

test('normalization, punctuation-only fallback and hierarchical promotions', () => {
  const headings = collectHeadings({
    type: 'doc',
    content: [
      heading('é'),
      heading('e\u0301'),
      heading('!!!'),
      heading('???'),
      heading('Top'),
      heading('Deep', 4),
      heading('Middle', 3),
      heading('Next'),
    ],
  });
  expect(headings.slice(0, 4).map((h) => h.id)).toEqual([
    'é',
    'é-2',
    'heading',
    'heading-2',
  ]);
  const outline = tocOutline(headings.slice(4), tocDefaults, 1);
  expect(outline.map((h) => h.id)).toEqual(['top', 'next']);
  expect(outline[0]?.children.map((h) => h.id)).toEqual(['deep', 'middle']);
  expect(
    tocOutline(headings.slice(4), { ...tocDefaults, excluded: ['top'] }, 1).map(
      (h) => h.id,
    ),
  ).toEqual(['deep', 'middle', 'next']);
});

test('editor position/page calculation and outlines follow edits', () => {
  const schema = getSchema(extensions);
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: [
      { type: 'tableOfContents' },
      heading('Before'),
      { type: 'pageBreak' },
      { type: 'tableOfContents' },
      heading('After'),
    ],
  });
  const pages: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'tableOfContents') pages.push(tocPage(doc, pos));
  });
  expect(pages).toEqual([1, 2]);
  const edited = doc.toJSON();
  edited.content[4] = heading('Renamed', 4);
  expect(
    tocOutline(collectHeadings(edited), tocDefaults, 2).map((h) => [
      h.id,
      h.level,
    ]),
  ).toEqual([['renamed', 4]]);
});

test('heading inline children render without commas or undefined content', () => {
  const doc = getSchema(extensions).nodeFromJSON({
    type: 'doc',
    content: [
      heading(''),
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'again' },
        ],
      },
    ],
  });
  const html = renderWithToc(doc, extensions);
  expect(html).toContain('<h2></h2>');
  expect(html).toMatch(
    /<h2 id="hello-world-again">Hello <strong>world<\/strong><br\s*\/?>again<\/h2>/,
  );
});

test('composes custom code nodes and caller-supplied render mappings', () => {
  const customCode = Node.create({
    name: 'codeBlock',
    group: 'block',
    content: 'text*',
    marks: '',
    renderHTML: () => ['pre', ['code', 0]],
  });
  const composed = [
    ...extensions
      .filter((extension) => extension.name !== 'codeBlock')
      .map((extension) =>
        extension.name === 'starterKit'
          ? extension.configure({ codeBlock: false })
          : extension,
      ),
    customCode,
  ];
  const doc = getSchema(composed).nodeFromJSON({
    type: 'doc',
    content: [
      { type: 'tableOfContents' },
      heading('Title'),
      {
        type: 'codeBlock',
        content: [{ type: 'text', text: 'const answer = 42;' }],
      },
    ],
  });
  const html = renderWithToc(doc, composed, {
    nodeMapping: {
      codeBlock: ({ node }) => `<pre data-custom>${node.textContent}</pre>`,
    },
  });
  expect(html).toContain('<pre data-custom>const answer = 42;</pre>');
  expect(html).toContain('href="#title"');
});
