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
