import type { Block } from '@cms/sdk';

/** Only selection attributes identify a query; layout changes reuse its results. */
export const queryKey = (block: Extract<Block, { name: 'query' }>) =>
  JSON.stringify([
    block.attrs.type,
    block.attrs.category,
    block.attrs.tag,
    block.attrs.author,
    block.attrs.count,
  ]);
