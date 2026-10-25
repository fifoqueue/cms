<script lang="ts">
  import { page } from '$app/state';
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

<!-- The public site links its own icon once one is set (Settings → General). -->
<svelte:head>
  {#if !(page.data.site as { icon?: unknown } | undefined)?.icon}
    <link rel="icon" href={favicon} />
  {/if}
  {#if data.uiFont}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- a font stack the theme schema checked -->
    {@html `<style>:root { --cms-ui-font: ${data.uiFont.family}; }</style>`}
  {/if}
</svelte:head>

{@render children()}
