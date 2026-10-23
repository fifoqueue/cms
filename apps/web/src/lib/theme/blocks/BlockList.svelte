<script lang="ts">
  import type { Block } from '@cms/sdk';
  import type { WidgetView } from '#lib/server/public-view.js';
  import WidgetArea from '#lib/theme/WidgetArea.svelte';
  import { queryKey, selectionOf } from '#lib/theme/queries.js';
  import { useScope } from '#lib/theme/scope.js';

  /** Data blocks drawn like the matching core widgets (latest posts, terms, archives). */
  let {
    block,
  }: {
    block: Extract<
      Block,
      { name: 'latest-posts' | 'categories' | 'tag-cloud' | 'archives' }
    >;
  } = $props();

  const scope = useScope();
  const widget = $derived.by((): WidgetView | null => {
    const base = { id: `block-${block.name}`, title: '' };
    switch (block.name) {
      case 'latest-posts': {
        const list = scope().queries?.[queryKey(selectionOf(block))];
        return list?.items.length
          ? {
              ...base,
              kind: 'recentPosts',
              posts: list.items.map(({ title, path, publishedAt }) => ({
                title,
                path,
                publishedAt,
              })),
            }
          : null;
      }
      case 'categories':
      case 'tag-cloud': {
        const terms =
          scope().terms[block.name === 'categories' ? 'category' : 'tag'];
        return terms?.length
          ? {
              ...base,
              kind: block.name === 'categories' ? 'categories' : 'tags',
              terms,
            }
          : null;
      }
      case 'archives': {
        const months = scope().months?.slice(0, block.attrs.months);
        return months?.length ? { ...base, kind: 'archives', months } : null;
      }
    }
  });
</script>

{#if widget}
  <div class="cms-block-{block.name}">
    <WidgetArea widgets={[widget]} locale={scope().site.locale} />
  </div>
{/if}
