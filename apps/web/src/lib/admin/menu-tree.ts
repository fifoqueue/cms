import type { MenuItem } from '@cms/sdk';

/** A menu item without children, at `depth` in a flat, depth-first list (what the editor edits). */
export type MenuRow = Omit<MenuItem, 'children'> & { depth: number };

/** Menus nest three levels deep: depths 0 to 2. */
export const MAX_DEPTH = 2;

export const toRows = (items: readonly MenuItem[], depth = 0): MenuRow[] =>
  items.flatMap(({ children, ...item }) => [
    { ...item, depth },
    ...toRows(children, depth + 1),
  ]);

export const toItems = (rows: readonly MenuRow[]): MenuItem[] => {
  const root: MenuItem[] = [];
  const parents: MenuItem[][] = [root];
  for (const { depth, ...row } of rows) {
    const item: MenuItem = { ...row, children: [] };
    const level = Math.min(depth, parents.length - 1);
    parents[level]!.push(item);
    parents.length = level + 1;
    parents.push(item.children);
  }
  return root;
};

/** Index just past the row's subtree. */
const blockEnd = (rows: readonly MenuRow[], index: number) => {
  let end = index + 1;
  while (end < rows.length && rows[end]!.depth > rows[index]!.depth) end += 1;
  return end;
};

const moveBlock = (
  rows: readonly MenuRow[],
  from: number,
  to: number,
  shift = 0,
) => {
  const end = blockEnd(rows, from);
  const block = rows
    .slice(from, end)
    .map((row) => ({ ...row, depth: row.depth + shift }));
  const rest = [...rows.slice(0, from), ...rows.slice(end)];
  const at = to > from ? to - block.length : to;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
};

/** Swaps the row (with its children) with the previous sibling; unchanged at the top. */
export const moveUp = (rows: readonly MenuRow[], index: number) => {
  const depth = rows[index]!.depth;
  let previous = index - 1;
  while (previous >= 0 && rows[previous]!.depth > depth) previous -= 1;
  return previous >= 0 && rows[previous]!.depth === depth
    ? moveBlock(rows, index, previous)
    : [...rows];
};

/** Swaps the row (with its children) with the next sibling; unchanged at the bottom. */
export const moveDown = (rows: readonly MenuRow[], index: number) => {
  const next = blockEnd(rows, index);
  return rows[next]?.depth === rows[index]!.depth
    ? moveBlock(rows, index, blockEnd(rows, next))
    : [...rows];
};

/** Makes the row a child of its previous sibling, if the depth limit allows. */
export const indent = (rows: readonly MenuRow[], index: number) => {
  const end = blockEnd(rows, index);
  const deepest = Math.max(...rows.slice(index, end).map((row) => row.depth));
  return index > 0 &&
    rows[index - 1]!.depth >= rows[index]!.depth &&
    deepest < MAX_DEPTH
    ? moveBlock(rows, index, index, 1)
    : [...rows];
};

/** Moves the row out of its parent, right after the parent's subtree. */
export const outdent = (rows: readonly MenuRow[], index: number) => {
  const depth = rows[index]!.depth;
  if (depth === 0) return [...rows];
  let after = blockEnd(rows, index);
  while (after < rows.length && rows[after]!.depth >= depth) after += 1;
  return moveBlock(rows, index, after, -1);
};

/** Removes the row and its children. */
export const removeRow = (rows: readonly MenuRow[], index: number) => [
  ...rows.slice(0, index),
  ...rows.slice(blockEnd(rows, index)),
];

/**
 * Drag and drop: moves the row (with its children) in front of row `to`, taking that row's
 * depth; `to === rows.length` appends at the top level. Unchanged when dropped inside itself or
 * when its children would nest too deep.
 */
export const moveTo = (rows: readonly MenuRow[], from: number, to: number) => {
  const end = blockEnd(rows, from);
  if (to >= from && to < end) return [...rows];
  const depth = to < rows.length ? rows[to]!.depth : 0;
  const shift = depth - rows[from]!.depth;
  const deepest = Math.max(...rows.slice(from, end).map((row) => row.depth));
  if (deepest + shift > MAX_DEPTH) return [...rows];
  return moveBlock(rows, from, to, shift);
};
