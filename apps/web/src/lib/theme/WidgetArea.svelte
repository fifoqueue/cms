<script lang="ts">
  import type { Path } from '$app/types';
  import { archivePath } from '@cms/sdk';
  import { useScope } from '#lib/theme/scope.js';
  import { resolve } from '$app/paths';
  import type { WidgetView } from '#lib/server/public-view.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { formatMonth, useDateFormat } from '#lib/theme/format.js';
  import MenuList from '#lib/theme/MenuList.svelte';

  interface Props {
    widgets: WidgetView[];
    locale: string;
    /** Footer widgets sit side by side; sidebar widgets stack. */
    layout?: 'stack' | 'columns';
  }

  let { widgets, locale, layout = 'stack' }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const formatDate = useDateFormat();
  const scope = useScope();
  const bases = $derived(
    scope?.().archives?.bases ?? { category: '/category', tag: '/tag' },
  );
</script>

<div
  class={layout === 'columns'
    ? 'grid gap-8 sm:grid-cols-2 lg:grid-cols-4'
    : 'space-y-8'}
>
  {#each widgets as widget (widget.id)}
    <section class="space-y-3 text-sm" aria-label={widget.title || undefined}>
      {#if widget.title}
        <h2 class="font-semibold text-foreground">{widget.title}</h2>
      {/if}
      {#if widget.kind === 'recentPosts'}
        <ul class="space-y-2">
          {#each widget.posts as post (post.path)}
            <li>
              <a href={resolve(post.path as Path)} class="hover:underline"
                >{post.title}</a
              >
              <span class="block text-xs text-muted-foreground"
                >{formatDate(post.publishedAt)}</span
              >
            </li>
          {/each}
        </ul>
      {:else if widget.kind === 'categories' || widget.kind === 'tags'}
        <ul
          class={widget.kind === 'tags' ? 'flex flex-wrap gap-2' : 'space-y-1'}
        >
          {#each widget.terms as term (term.slug)}
            <li style:padding-inline-start="{term.depth}rem">
              <a
                href={widget.kind === 'tags'
                  ? resolve(archivePath(bases, 'tag', term.slug) as Path)
                  : resolve(archivePath(bases, 'category', term.slug) as Path)}
                class="hover:underline"
                >{term.name}
                <span class="text-xs text-muted-foreground">({term.count})</span
                ></a
              >
            </li>
          {/each}
        </ul>
      {:else if widget.kind === 'search'}
        <form role="search" method="GET" action={resolve('/(site)')}>
          <label class="sr-only" for="widget-search-{widget.id}"
            >{m.search}</label
          >
          <input
            id="widget-search-{widget.id}"
            name="q"
            type="search"
            maxlength={200}
            class="h-8 w-full rounded-md border bg-background px-2"
          />
        </form>
      {:else if widget.kind === 'text'}
        <p class="whitespace-pre-line text-muted-foreground">{widget.text}</p>
      {:else if widget.kind === 'menu'}
        <MenuList items={widget.items} />
      {:else if widget.kind === 'archives'}
        <ul class="space-y-1">
          {#each widget.months as month (`${month.year}-${month.month}`)}
            <li>
              <a
                href={resolve('/(site)/date/[year]/[[month]]', {
                  year: String(month.year),
                  month: String(month.month).padStart(2, '0'),
                })}
                class="hover:underline"
                >{formatMonth(month.year, month.month, locale)}
                <span class="text-xs text-muted-foreground"
                  >({month.count})</span
                ></a
              >
            </li>
          {/each}
        </ul>
      {:else if widget.kind === 'recentComments'}
        <ul class="space-y-2">
          {#each widget.comments as comment, index (index)}
            <li>
              {m.commentOn(comment.author)}
              <a href={resolve(comment.path as Path)} class="hover:underline"
                >{comment.title}</a
              >
            </li>
          {/each}
        </ul>
      {:else if widget.kind === 'html'}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- HTML of an installed plugin's widget, like slots -->
        {@html widget.html}
      {/if}
    </section>
  {/each}
</div>
