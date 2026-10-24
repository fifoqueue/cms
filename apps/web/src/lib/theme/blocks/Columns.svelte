<script lang="ts">
  import type { Block } from '@cms/sdk';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import { useScope } from '#lib/theme/scope.js';

  let { block }: { block: Extract<Block, { name: 'columns' }> } = $props();

  const scope = useScope();
  const GAP = {
    none: 'gap-0',
    small: 'gap-3',
    medium: 'gap-6',
    large: 'gap-10',
  } as const;

  /** A column holding only empty widget areas disappears, like a WordPress sidebar without widgets. */
  const shown = $derived(
    block.children.filter(
      (column) =>
        column.children.length === 0 ||
        column.children.some(
          (child) =>
            child.name !== 'widget-area' ||
            scope().widgets[child.attrs.area].length > 0,
        ),
    ),
  );
</script>

<div
  class="cms-block-columns flex {block.attrs.stackOnMobile
    ? 'flex-col @min-[48rem]:flex-row'
    : 'flex-row'} {GAP[block.attrs.gap]}"
>
  {#each shown as column, index (index)}
    {#if column.name === 'column'}
      <div
        class="cms-block-column flex min-w-0 flex-col gap-8 {column.attrs.width
          ? '@min-[48rem]:shrink-0'
          : 'flex-1'}"
        style={column.attrs.width
          ? `flex-basis: ${column.attrs.width}%`
          : undefined}
      >
        <Blocks
          blocks={column.children}
          within={block.children.indexOf(column)}
        />
      </div>
    {/if}
  {/each}
</div>
