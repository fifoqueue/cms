<script lang="ts">
  import type { Snippet } from 'svelte';
  import { provideBlockPath } from '#lib/theme/scope.js';

  /** Marks a block for the site editor's canvas, so clicking it selects it. */
  let { path, children }: { path: number[]; children: Snippet } = $props();

  // svelte-ignore state_referenced_locally
  provideBlockPath(path);
</script>

<div style="display: contents" data-block-path={path.join('.')}>
  {@render children()}
</div>
