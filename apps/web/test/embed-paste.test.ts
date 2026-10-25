import { expect, test } from 'bun:test';
import { contentExtensions } from '@cms/content';
import { getSchema } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  embedMatchers,
  embedPasteTarget,
  embedPasteUrl,
} from '#lib/admin/editor/embed-paste.js';

const youtube = await embedMatchers([
  {
    id: 'youtube',
    label: 'YouTube',
    urlPattern:
      '^https://(?:www\\.)?(?:youtube\\.com/watch\\?v=|youtu\\.be/)(?<id>[\\w-]{11})',
  },
]);

test('only a single matching https URL is an embed URL', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  expect(embedPasteUrl(`  ${url}\n`, youtube)).toBe(url);
  expect(embedPasteUrl('http://youtu.be/dQw4w9WgXcQ', youtube)).toBeNull();
  expect(embedPasteUrl(`see ${url}`, youtube)).toBeNull();
  expect(embedPasteUrl(`${url} ${url}`, youtube)).toBeNull();
  expect(embedPasteUrl('https://example.com/watch', youtube)).toBeNull();
  expect(embedPasteUrl(url, [])).toBeNull();
});

test('patterns that do not compile are skipped', async () => {
  const matchers = await embedMatchers([
    { id: 'bad', label: 'Bad', urlPattern: '(' },
    { id: 'any', label: 'Any', urlPattern: '^https://v\\.example/' },
  ]);
  expect(matchers).toHaveLength(1);
  expect(embedPasteUrl('https://v.example/1', matchers)).toBe(
    'https://v.example/1',
  );
});

test('caps both pasted and normalized URL length before matching', () => {
  const boundary =
    'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length);
  expect(embedPasteUrl(boundary, [/^https:/])).toBe(boundary);
  const matcher = /^https:/;
  matcher.test = () => {
    throw new Error('Oversized URL reached the matcher');
  };
  expect(embedPasteUrl(boundary + 'a', [matcher])).toBeNull();
  expect(
    embedPasteUrl('https://example.com/' + '한'.repeat(300), [matcher]),
  ).toBeNull();
});

const schema = getSchema(contentExtensions);
/** A state with the caret at `pos` (or `from`–`to` selected). */
const at = (doc: Node, from: number, to = from) =>
  EditorState.create({
    doc,
    selection: TextSelection.create(doc, from, to),
  });
const p = (text?: string) =>
  schema.nodes.paragraph!.create(null, text ? schema.text(text) : null);
const doc = (...nodes: Node[]) => schema.nodes.doc!.create(null, nodes);

test('an empty paragraph is replaced whole', () => {
  expect(embedPasteTarget(at(doc(p('a'), p()), 4))).toEqual({
    from: 3,
    to: 5,
  });
});

test('text, a selection, code and table cells keep the normal paste', () => {
  expect(embedPasteTarget(at(doc(p('ab')), 2))).toBeNull();
  expect(embedPasteTarget(at(doc(p('ab')), 1, 3))).toBeNull();
  const code = schema.nodes.codeBlock!.create();
  expect(embedPasteTarget(at(doc(code), 1))).toBeNull();
  const cell = schema.nodes.tableCell!.create(null, p());
  const table = schema.nodes.table!.create(null, [
    schema.nodes.tableRow!.create(null, cell),
  ]);
  expect(embedPasteTarget(at(doc(table), 4))).toBeNull();
});
