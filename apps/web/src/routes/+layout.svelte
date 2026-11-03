<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import favicon from '#lib/assets/favicon.svg';
  import SiteFonts from '#lib/theme/SiteFonts.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  // Public pages (`theme/public.css`) and the rest (`layout.css`) carry separate Tailwind builds
  // with the same layer names: the one loaded last wins, and the client never unloads a
  // stylesheet. Crossing between them loads a fresh document instead.
  const isPublic = (id: string) => id.startsWith('/(site)');
  beforeNavigate(({ from, to, willUnload }) => {
    if (willUnload || !from?.route.id || !to?.route.id) return;
    if (isPublic(from.route.id) !== isPublic(to.route.id))
      location.href = to.url.href;
  });
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
