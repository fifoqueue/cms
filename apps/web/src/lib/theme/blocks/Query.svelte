<script lang="ts">
  import type { Block } from '@cms/sdk';
  import { useI18n } from '#lib/i18n/index.js';
  import Pagination from '#lib/theme/Pagination.svelte';
  import { termTarget } from '#lib/theme/pagination.js';
  import type { ListingTarget } from '#lib/theme/pagination.js';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import BlockView from '#lib/theme/blocks/Block.svelte';
  import PostScope from '#lib/theme/blocks/PostScope.svelte';
  import { queryKey, selectionOf } from '#lib/theme/queries.js';
  import { useScope } from '#lib/theme/scope.js';

  /** The page's main query (WordPress "inherit query"): the posts of this archive, search or home. */
  let { block }: { block: Extract<Block, { name: 'query' }> } = $props();

  const scope = useScope();
  const i18n = useI18n();
  const GAP = {
    none: 'gap-0',
    small: 'gap-4',
    medium: 'gap-6',
    large: 'gap-10',
  } as const;
  const GRID = [
    '',
    'grid-cols-1',
    'sm:grid-cols-2',
    'sm:grid-cols-2 lg:grid-cols-3',
    'sm:grid-cols-2 lg:grid-cols-4',
  ];

  const page = $derived(scope().page);
  const posts = $derived(
    block.attrs.inherit
      ? 'posts' in page
        ? page.posts
        : null
      : (scope().queries?.[queryKey(selectionOf(block))] ?? null),
  );
  const target = $derived.by((): ListingTarget | null => {
    if (!block.attrs.inherit) return null;
    switch (page.kind) {
      case 'home':
        return { kind: 'home', type: page.type, path: page.path };
      case 'search':
        return { kind: 'search', query: page.query };
      case 'term':
        return termTarget(page.term.taxonomy, page.term.slug, page.term.path);
      case 'author':
        return { kind: 'author', slug: page.author.slug };
      case 'date':
        return { kind: 'date', year: page.date.year, month: page.date.month };
      case 'archive':
        return { kind: 'archive', slug: page.archive.key };
      default:
        return null;
    }
  });
  const a = $derived(block.attrs);
</script>

{#if posts}
  <div class="cms-block-query flex flex-col gap-10">
    {#each block.children as child, index (index)}
      {#if child.name === 'post-template'}
        {#if posts.items.length}
          <ul
            class="cms-block-post-template {a.layout === 'grid'
              ? `grid grid-cols-1 ${GRID[a.columns]} ${GAP[a.gap]}`
              : `flex flex-col ${a.divider ? 'divide-y' : GAP[a.gap]}`}"
          >
            {#each posts.items as post (post.id)}
              <li
                class={a.layout === 'grid'
                  ? 'flex flex-col gap-3 overflow-hidden rounded-[var(--radius)] border bg-card p-5 text-card-foreground shadow-xs transition hover:shadow-md'
                  : `flex flex-col gap-3 ${a.divider ? 'py-8 first:pt-0 last:pb-0' : ''}`}
              >
                <PostScope {post} blocks={child.children} within={index} />
              </li>
            {/each}
          </ul>
        {/if}
      {:else if child.name === 'query-no-results'}
        {#if !posts.items.length}
          <div class="cms-block-query-no-results">
            {#if child.children.length}
              <Blocks blocks={child.children} within={index} />
            {:else}
              <p class="text-muted-foreground">
                {page.kind === 'search'
                  ? i18n.m.themeSearchEmpty
                  : i18n.m.noPosts}
              </p>
            {/if}
          </div>
        {/if}
      {:else if child.name === 'query-pagination'}
        {#if target}
          <Pagination
            {target}
            page={posts.page}
            total={posts.total}
            pageSize={posts.pageSize}
          />
        {/if}
      {:else}
        <BlockView block={child} />
      {/if}
    {/each}
  </div>
{:else if page.kind === 'search'}
  <p class="text-muted-foreground">{i18n.m.themeSearchPrompt}</p>
{/if}
