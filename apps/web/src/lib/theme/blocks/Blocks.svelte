<script lang="ts">
  import type { Block as BlockData } from '@cms/sdk';
  import Block from '#lib/theme/blocks/Block.svelte';

  let { blocks }: { blocks: BlockData[] } = $props();
</script>

{#each blocks as block, index (index)}
  <Block {block} />
{/each}
