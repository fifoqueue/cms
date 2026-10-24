<script lang="ts">
  import { scopedCss } from '#lib/theme/style.js';

  /**
   * A theme's `style.css` in the document head, confined to `.cms-site` elements (the public
   * site root and the site editor's canvases), so it never styles the surrounding page.
   */
  let { css }: { css: string } = $props();

  const scoped = $derived(scopedCss(css));
</script>

<svelte:head>
  {#if scoped}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the theme stylesheet, checked by cssProblem (no markup, no resources, balanced braces) -->
    {@html `<style>${scoped}</style>`}
  {/if}
</svelte:head>
