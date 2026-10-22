<script lang="ts">
  import type { Head } from '#lib/seo/head.js';

  /** The page's only title/meta/link/JSON-LD set; rendered once by the site layout. */
  let { head }: { head: Head } = $props();
</script>

<svelte:head>
  <title>{head.title}</title>
  {#each head.meta as tag, index (index)}
    {#if tag.name}<meta name={tag.name} content={tag.content} />{:else}<meta
        property={tag.property}
        content={tag.content}
      />{/if}
  {/each}
  {#each head.links as link, index (index)}
    <link rel={link.rel} href={link.href} type={link.type} title={link.title} />
  {/each}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- built by jsonLdScript, which escapes every <, > and & -->
  {@html head.jsonLd}
</svelte:head>
