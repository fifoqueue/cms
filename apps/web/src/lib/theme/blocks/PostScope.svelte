<script lang="ts">
  import type { Block } from '@cms/sdk';
  import type { PostSummary } from '#lib/server/public-view.js';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import { providePost } from '#lib/theme/scope.js';

  let {
    post,
    blocks,
    within,
  }: { post: PostSummary; blocks: Block[]; within?: number } = $props();

  providePost(() => post);
</script>

<Blocks {blocks} {within} />
