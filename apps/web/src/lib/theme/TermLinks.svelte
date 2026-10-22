<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { archivePath } from '@cms/sdk';
  import { useScope } from '#lib/theme/scope.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface TermLink {
    id: string;
    name: string;
    slug: string;
  }

  interface Props {
    categories?: TermLink[];
    tags?: TermLink[];
  }

  let { categories = [], tags = [] }: Props = $props();

  const i18n = useI18n();
  const scope = useScope();
  const bases = $derived(
    scope?.().archives?.bases ?? { category: '/category', tag: '/tag' },
  );
</script>

{#if categories.length || tags.length}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    {#if categories.length}
      <span class="sr-only">{i18n.m.categoriesLabel}:</span>
      {#each categories as category (category.id)}
        <a
          href={resolve(archivePath(bases, 'category', category.slug) as Path)}
          class="font-medium text-primary hover:underline">{category.name}</a
        >
      {/each}
    {/if}
    {#if tags.length}
      <span class="sr-only">{i18n.m.themeTags}:</span>
      {#each tags as tag (tag.id)}
        <a
          href={resolve(archivePath(bases, 'tag', tag.slug) as Path)}
          class="text-muted-foreground hover:text-foreground">#{tag.name}</a
        >
      {/each}
    {/if}
  </div>
{/if}
