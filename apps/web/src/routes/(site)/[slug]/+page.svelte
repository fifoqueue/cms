<script lang="ts">
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import { formatDate } from '#lib/theme/format.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.content.title} · {data.site.title}</title>
  {#if data.content.excerpt}<meta
      name="description"
      content={data.content.excerpt}
    />{/if}
</svelte:head>

<article>
  <header class="mb-8">
    <h1 class="text-4xl font-bold tracking-tight">{data.content.title}</h1>
    {#if data.content.type === 'post'}
      <time
        class="mt-2 block text-sm text-muted-foreground"
        datetime={data.content.publishedAt}
      >
        {formatDate(data.content.publishedAt, data.site.locale)}
      </time>
    {/if}
  </header>

  <SlotOutlet fragments={data.slots['content.before']} />
  <div class="prose max-w-none dark:prose-invert">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered by the API from a schema-validated document -->
    {@html data.content.html}
  </div>
  <SlotOutlet fragments={data.slots['content.after']} />
</article>
