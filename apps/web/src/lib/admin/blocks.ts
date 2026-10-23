import { BLOCK_NAMES, BLOCKS } from '@cms/sdk';
import type { Block, BlockName, BlockSpec } from '@cms/sdk';

const spec = (name: BlockName): BlockSpec => BLOCKS[name];

/** Blocks that may be added at the top level (`null`) or inside `parent`. */
export const allowedBlocks = (parent: BlockName | null): BlockName[] => {
  const children = parent ? spec(parent).children : 'any';
  if (!children) return [];
  return BLOCK_NAMES.filter((name) => {
    const own = spec(name).parent;
    if (own && (!parent || !own.includes(parent))) return false;
    return children === 'any' || children.includes(name);
  });
};

export const canHaveChildren = (name: BlockName) => !!spec(name).children;

const defaults = (name: BlockName) =>
  Object.fromEntries(
    Object.entries(spec(name).attrs).map(([key, attr]) => [key, attr.default]),
  );

/** A new block with default attributes and a useful starting point for containers. */
export const newBlock = (name: BlockName): Block => {
  const make = (child: BlockName, children: Block[] = []) =>
    ({ name: child, attrs: defaults(child), children }) as Block;
  const children =
    name === 'columns'
      ? [make('column'), make('column')]
      : name === 'query'
        ? [
            make('post-template', [
              {
                ...make('post-title'),
                attrs: { ...defaults('post-title'), link: true },
              } as Block,
              make('post-excerpt'),
            ]),
            make('query-no-results'),
            make('query-pagination'),
          ]
        : [];
  return make(name, children);
};

/** A short hint shown next to a collapsed block. */
export const blockSummary = (block: Block): string => {
  switch (block.name) {
    case 'heading':
    case 'paragraph':
      return block.attrs.text.slice(0, 60);
    case 'template-part':
      return block.attrs.slug;
    case 'navigation':
    case 'widget-area':
      return block.name === 'navigation'
        ? block.attrs.location
        : block.attrs.area;
    case 'group':
      return block.attrs.layout;
    default:
      return '';
  }
};

/** A block's place in the edited tree: child indexes from the root. */
export type BlockPath = number[];

export const pathKey = (path: BlockPath) => path.join('.');

/** The list a block at `path` sits in, with its index; null when the path is gone. */
export const slotAt = (tree: Block[], path: BlockPath) => {
  let list = tree;
  for (const index of path.slice(0, -1)) {
    const block = list[index];
    if (!block) return null;
    list = block.children;
  }
  const index = path[path.length - 1];
  return index !== undefined && list[index] ? { list, index } : null;
};

export const blockAt = (tree: Block[], path: BlockPath) => {
  const slot = slotAt(tree, path);
  return slot ? slot.list[slot.index]! : null;
};

/**
 * Where a new block goes (WordPress inserter): inside the selected block when it may hold
 * that block, after it when its container may, otherwise at the end of the tree.
 */
export const insertionPoint = (
  tree: Block[],
  selected: BlockPath | null,
  name: BlockName,
): BlockPath => {
  const block = selected && blockAt(tree, selected);
  if (block && selected) {
    if (allowedBlocks(block.name).includes(name))
      return [...selected, block.children.length];
    const parent =
      selected.length > 1 ? blockAt(tree, selected.slice(0, -1)) : null;
    if (allowedBlocks(parent?.name ?? null).includes(name))
      return [...selected.slice(0, -1), selected[selected.length - 1]! + 1];
  }
  return [tree.length];
};

/** Inserts `block` at `path` (a position in an existing list). */
export const insertAt = (tree: Block[], path: BlockPath, block: Block) => {
  const list =
    path.length > 1 ? blockAt(tree, path.slice(0, -1))?.children : tree;
  list?.splice(path[path.length - 1]!, 0, block);
};
