<script lang="ts">
  import type { PublicFont } from '@cms/sdk';
  import { fontFaceCss } from '#lib/theme/style.js';

  /**
   * Loads site fonts in the document head: a stylesheet link for fonts from an external
   * stylesheet, `@font-face` rules for fonts from files. Only fonts the page's styles use are
   * passed in.
   */
  let { fonts }: { fonts: readonly PublicFont[] } = $props();

  const faces = $derived(fontFaceCss(fonts));
</script>

<svelte:head>
  {#each fonts as font (font.family)}
    {#if font.stylesheet}
      <link rel="stylesheet" href={font.stylesheet} />
    {/if}
  {/each}
  {#if faces}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- @font-face rules from schema-checked family names and addresses -->
    {@html `<style>${faces}</style>`}
  {/if}
</svelte:head>
