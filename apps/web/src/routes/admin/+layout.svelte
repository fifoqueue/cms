<script lang="ts">
  import { applyColorMode, colorModeScript } from '#lib/admin/color-mode.js';
  import NavigationProgress from '#lib/components/NavigationProgress.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  // Also covers client-side navigation into and out of the admin area.
  $effect(() => applyColorMode(data.colorMode));
</script>

<svelte:head>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- fixed script; the mode is one of COLOR_MODES -->
  {@html colorModeScript(data.colorMode)}
</svelte:head>

<div class="cms-admin contents">
  <NavigationProgress />
  {@render children()}
</div>
