import { describe, expect, test } from 'bun:test';
import { defaultTreeAdapter as adapter, parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { createPageMinifier, minifyHtml } from '#lib/server/html-minifier.js';

// Server-compile `.svelte` fixtures so the document carries real Svelte hydration markers.
Bun.plugin({
  name: 'svelte-server',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      loader: 'js',
      contents: compile(await Bun.file(path).text(), {
        filename: path,
        generate: 'server',
        runes: true,
      }).js.code,
    }));
  },
});

const { default: Fixture } = await import('./fixtures/Hydration.svelte');

const template = await Bun.file(
  new URL('../src/app.html', import.meta.url),
).text();

const script = `
  {
    __minifier_test = { base: new URL('.', 'https://example.test/a/b').pathname.slice(0, -1) };
    const element = 'target';
    __minifier_test.started = [element, ...[1, 2]].join('-');
  }
`;

const style = `
  .note  { color : red ; }
`;

const renderPage = () => {
  const { head, body } = render(Fixture, {
    props: {
      items: ['one', 'two'],
      headHtml: '<meta name="generator"   content="plugin">',
      html: '<span>plugin</span> <em>html</em>',
      note: 'Hello   world',
    },
  });

  return template
    .replace('%sveltekit.head%', () => `${head}\n<style>${style}</style>`)
    .replace('%sveltekit.body%', () => `${body}\n<script>${script}</script>`);
};

type Node = DefaultTreeAdapterTypes.ChildNode;

const RAW_TEXT = new Set(['script', 'style']);

/** `document.title`: the title text with ASCII whitespace stripped and collapsed (HTML spec). */
const documentTitle = (node: DefaultTreeAdapterTypes.Element) =>
  adapter
    .getChildNodes(node)
    .map((child) =>
      adapter.isTextNode(child) ? adapter.getTextNodeContent(child) : '',
    )
    .join('')
    .split(/[\t\n\f\r ]+/)
    .filter(Boolean)
    .join(' ');

/**
 * The parsed tree, with script/style contents left out (they are compared by behavior) and the
 * title compared by the value browsers expose: the minifier always collapses title whitespace
 * (documented in `html-minifier.ts`), so only `document.title` is preserved there.
 */
const tree = (node: Node): unknown => {
  if (adapter.isTextNode(node)) return adapter.getTextNodeContent(node);

  if (adapter.isCommentNode(node))
    return { comment: adapter.getCommentNodeContent(node) };

  if (adapter.isDocumentTypeNode(node))
    return { doctype: adapter.getDocumentTypeNodeName(node) };

  if (adapter.isElementNode(node)) {
    const tag = adapter.getTagName(node);

    return {
      tag,
      attrs: adapter.getAttrList(node).map(({ name, value }) => [name, value]),
      children: RAW_TEXT.has(tag)
        ? null
        : tag === 'title'
          ? documentTitle(node)
          : adapter.getChildNodes(node).map(tree),
    };
  }

  return node.nodeName;
};

const documentTree = (html: string) =>
  adapter.getChildNodes(parse(html)).map(tree);

const rawTexts = (html: string, tag: string) => {
  const found: string[] = [];

  const walk = (node: Node) => {
    if (!adapter.isElementNode(node)) return;

    const children = adapter.getChildNodes(node);

    if (adapter.getTagName(node) === tag)
      found.push(
        children
          .map((child) =>
            adapter.getTextNodeContent(
              child as DefaultTreeAdapterTypes.TextNode,
            ),
          )
          .join(''),
      );
    else children.forEach(walk);
  };

  adapter.getChildNodes(parse(html)).forEach(walk);

  return found;
};

const runScript = (code: string) => {
  new Function(code)();

  const result = (globalThis as Record<string, unknown>).__minifier_test;
  delete (globalThis as Record<string, unknown>).__minifier_test;

  return result;
};

describe('minifyHtml', () => {
  test('keeps every parsed node, including hydration markers, whitespace, pre and textarea', async () => {
    const original = renderPage();
    const minified = await minifyHtml(original);

    expect(minified.length).toBeLessThan(original.length);
    expect(documentTree(minified)).toEqual(documentTree(original));
  });

  test('minifies inline scripts and styles without changing what they do', async () => {
    const original = renderPage();
    const minified = await minifyHtml(original);

    const [before] = rawTexts(original, 'script');
    const [after] = rawTexts(minified, 'script');

    expect(after.length).toBeLessThan(before.length);
    expect(runScript(after)).toEqual(runScript(before));

    const [styleAfter] = rawTexts(minified, 'style');

    expect(styleAfter.length).toBeLessThan(style.length);
    expect(styleAfter).not.toContain(' ');
  });

  test('returns a document with parse errors unchanged', async () => {
    const broken = '<p>unclosed <b>bold</p><div';

    expect(await minifyHtml(broken)).toBe(broken);
  });
});

describe('createPageMinifier', () => {
  const splitPoints = (html: string) => [
    html.indexOf('<head>') + 3,
    html.indexOf('<pre>') + 2,
    html.indexOf('</textarea>') - 4,
  ];

  test('emits the same document for a page split into malformed chunks as for the whole page', async () => {
    const original = renderPage();
    const points = splitPoints(original);
    const chunks = [0, ...points].map((start, index) =>
      original.slice(start, points[index]),
    );
    const transform = createPageMinifier();

    const emitted: string[] = [];

    for (const [index, html] of chunks.entries())
      emitted.push(
        await transform({ html, done: index === chunks.length - 1 }),
      );

    expect(chunks.join('')).toBe(original);
    expect(emitted.join('')).toBe(await minifyHtml(original));
    expect(documentTree(emitted.join(''))).toEqual(documentTree(original));
  });

  test('keeps each response separate', async () => {
    const first = createPageMinifier();
    const second = createPageMinifier();

    await first({ html: '<!doctype html><html><head>', done: false });

    const page = renderPage();

    expect(await second({ html: page, done: true })).toBe(
      await minifyHtml(page),
    );
  });
});
