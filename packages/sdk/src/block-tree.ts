import type { Block } from '#sdk/blocks';

/** Every block in a tree, depth first. */
export function* walkBlocks(blocks: readonly Block[]): Generator<Block> {
  for (const block of blocks) {
    yield block;
    yield* walkBlocks(block.children);
  }
}
