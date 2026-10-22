import { expect, test } from 'bun:test';
import {
  indent,
  moveDown,
  moveUp,
  outdent,
  removeRow,
  toItems,
  toRows,
} from '#lib/admin/menu-tree.js';
import type { MenuRow } from '#lib/admin/menu-tree.js';

const rows = (spec: string): MenuRow[] =>
  spec.split(' ').map((entry) => ({
    id: entry.replace(/^-+/, ''),
    label: '',
    kind: 'home',
    newTab: false,
    depth: entry.length - entry.replace(/^-+/, '').length,
  }));
const shape = (list: MenuRow[]) =>
  list.map((row) => '-'.repeat(row.depth) + row.id).join(' ');

test('menu rows move with their children and keep the three-level limit', () => {
  const start = rows('a -b --c d');
  expect(shape(toRows(toItems(start)))).toBe('a -b --c d');
  expect(shape(moveDown(start, 0))).toBe('d a -b --c');
  expect(shape(moveUp(start, 3))).toBe('d a -b --c');
  expect(shape(moveUp(start, 1))).toBe('a -b --c d');
  expect(shape(indent(start, 3))).toBe('a -b --c -d');
  expect(shape(indent(start, 1))).toBe('a -b --c d');
  expect(shape(outdent(rows('a -b -c d'), 1))).toBe('a -c b d');
  expect(shape(removeRow(start, 1))).toBe('a d');
});
