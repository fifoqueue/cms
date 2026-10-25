<script lang="ts">
  import '#web/routes/layout.css';
  import favicon from '#lib/assets/favicon.svg';
  import SiteFonts from '#lib/theme/SiteFonts.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
</script>

<!-- Every screen reads in the site's body font (Appearance → Editor → Styles): `font-sans`. -->
{#if data.uiFont}
  <SiteFonts fonts={data.uiFont.fonts} />
{/if}

<!-- Every screen shows the site icon (Settings → General), or the default one while none is set. -->
<svelte:head>
  <link rel="icon" href={data.icon ?? favicon} />
  {#if data.uiFont}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- a font stack the theme schema checked -->
    {@html `<style>:root { --cms-ui-font: ${data.uiFont.family}; }</style>`}
  {/if}
</svelte:head>

{@render children()}
