<script lang="ts">
  /** Renders plugin HTML for one slot. Every theme must place all slots (see AGENTS.md). */
  let { fragments = [] }: { fragments?: string[] } = $props();
</script>

{#each fragments as html, index (index)}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- produced by installed plugins, which are trusted server code -->
  {@html html}
{/each}
