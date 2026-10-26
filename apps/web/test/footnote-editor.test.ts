import { expect, test } from 'bun:test';
import { contentExtensions } from '@cms/content';
import { getSchema } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import {
  footnotePages,
  publishedDocument,
} from '#lib/admin/editor/footnote-notes.js';

const note = (text: string, name = '') => ({
  type: 'footnote',
  attrs: { name, text },
});
const paragraph = (...content: JSONContent[]) => ({
  type: 'paragraph',
  content,
});

test('saving keeps named references without text and drops blank numbered notes', () => {
  const saved = publishedDocument({
    type: 'doc',
    content: [
      paragraph(
        note(' Source '),
        note('', 'src'),
        note('  '),
        note('', 'bad name'),
      ),
    ],
  });
  expect(saved.content[0]!.content).toEqual([note('Source'), note('', 'src')]);
});

test("labels restart per page while a name's first definition wins on every page", () => {
  const doc = Node.fromJSON(getSchema(contentExtensions), {
    type: 'doc',
    content: [
      paragraph(note('A'), note('', 'src'), note('Body', 'src')),
      { type: 'pageBreak' },
      paragraph(note('', 'src'), note('Later', 'src'), note('B')),
    ],
  });
  expect(
    footnotePages(doc).pages.map(({ page, notes }) => [
      page,
      notes.map(({ label, text }) => [label, text]),
    ]),
  ).toEqual([
    [
      1,
      [
        ['1', 'A'],
        ['src', 'Body'],
      ],
    ],
    [
      2,
      [
        ['src', 'Body'],
        ['2', 'B'],
      ],
    ],
  ]);
});
