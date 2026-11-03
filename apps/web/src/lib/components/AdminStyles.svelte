<script lang="ts">
  import { browser } from '$app/env';
  import { default as stylesheet } from '#web/routes/layout.css?url';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const href = browser
    ? new URL(stylesheet, document.baseURI).href
    : stylesheet;
  // Hydration keeps SSR content; a cold client navigation waits for the blocking CSS.
  let ready = $state(
    !browser ||
      Array.from(document.styleSheets).some((sheet) => sheet.href === href),
  );
</script>

<svelte:head>
  <!-- A failed stylesheet still shows the content: unstyled sign-in or error text beats a blank page. -->
  <link
    rel="stylesheet"
    href={stylesheet}
    onload={() => (ready = true)}
    onerror={() => (ready = true)}
  />
</svelte:head>

{#if ready}
  {@render children()}
{/if}
