<script lang="ts">
  import { page } from '$app/state';
  import '#web/routes/layout.css';
  import favicon from '#lib/assets/favicon.svg';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<!-- The public site links its own icon once one is set (Settings → General). -->
<svelte:head>
  {#if !(page.data.site as { icon?: unknown } | undefined)?.icon}
    <link rel="icon" href={favicon} />
  {/if}
</svelte:head>

{@render children()}
