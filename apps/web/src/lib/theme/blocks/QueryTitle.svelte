<script lang="ts">
  import type { Block } from '@cms/sdk';
  import { termLabel } from '#lib/seo/head.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { formatMonth } from '#lib/theme/format.js';
  import { useScope } from '#lib/theme/scope.js';

  /** The heading of an archive, search, posts page or error page. */
  let { block }: { block: Extract<Block, { name: 'query-title' }> } = $props();

  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const page = $derived(scope().page);
  const a = $derived(block.attrs);

  const view = $derived.by(() => {
    switch (page.kind) {
      case 'home':
        return page.title
          ? { title: page.title }
          : {
              title:
                page.type === 'article' ? m.themeArticles : scope().site.title,
              hidden: true,
            };
      case 'search':
        return {
          title: page.query ? m.themeSearchResults(page.query) : m.themeSearch,
          count: page.posts ? m.themeResults(page.posts.total) : undefined,
        };
      case 'term':
        return {
          label: termLabel(page.term.taxonomy, m),
          title:
            page.term.taxonomy === 'tag'
              ? `#${page.term.name}`
              : page.term.name,
          description: page.term.description,
          count: m.themePostCount(page.posts.total),
        };
      case 'author':
        return {
          title: m.authorArchive(page.author.name),
          description: page.author.bio,
          count: m.themePostCount(page.posts.total),
        };
      case 'date':
        return {
          title: page.date.month
            ? formatMonth(page.date.year, page.date.month, scope().site.locale)
            : String(page.date.year),
          count: m.themePostCount(page.posts.total),
        };
      case 'archive':
        return {
          title: page.archive.name,
          description: page.archive.description,
          count: m.themePostCount(page.posts.total),
        };
      case 'error':
        return page.status === 404
          ? {
              label: '404',
              title: m.themeNotFound,
              description: m.themeNotFoundHelp,
            }
          : { label: String(page.status), title: page.message };
      default:
        return null;
    }
  });
</script>

{#if view}
  <header
    class="cms-block-query-title space-y-2"
    class:sr-only={'hidden' in view && view.hidden}
  >
    {#if 'label' in view && view.label}
      <p class="text-xs font-semibold tracking-widest text-primary uppercase">
        {view.label}
      </p>
    {/if}
    <svelte:element
      this={`h${a.level}`}
      class="cms-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
      >{view.title}</svelte:element
    >
    {#if a.showDescription && 'description' in view && view.description}
      <p class="max-w-2xl text-lg text-muted-foreground">{view.description}</p>
    {/if}
    {#if a.showCount && 'count' in view && view.count}
      <p class="text-sm text-muted-foreground">{view.count}</p>
    {/if}
  </header>
{/if}
