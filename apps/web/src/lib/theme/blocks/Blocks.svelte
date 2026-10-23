<script lang="ts">
  import type { Block as BlockData } from '@cms/sdk';
  import Block from '#lib/theme/blocks/Block.svelte';
  import BlockFrame from '#lib/theme/blocks/BlockFrame.svelte';
  import { useBlockPath } from '#lib/theme/scope.js';

  interface Props {
    blocks: BlockData[];
    /** Index of the child holding `blocks` when it is not the enclosing block (columns, loops). */
    within?: number;
  }

  let { blocks, within }: Props = $props();

  const parent = useBlockPath();
  const base = $derived(
    parent && within !== undefined ? [...parent, within] : parent,
  );
</script>

{#each blocks as block, index (index)}
  {#if base}
    <BlockFrame path={[...base, index]}><Block {block} /></BlockFrame>
  {:else}
    <Block {block} />
  {/if}
{/each}
