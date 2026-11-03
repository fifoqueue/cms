<script lang="ts">
  import type { Block } from '@cms/sdk';
  import type { PostSummary } from '#lib/server/public-view.js';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import { provideLeadPost, providePost } from '#lib/theme/scope.js';

  let {
    post,
    blocks,
    within,
    lead = false,
  }: {
    post: PostSummary;
    blocks: Block[];
    within?: number;
    /** The first post of the page's main query. */
    lead?: boolean;
  } = $props();

  providePost(() => post);
  provideLeadPost(() => lead);
</script>

<Blocks {blocks} {within} />
