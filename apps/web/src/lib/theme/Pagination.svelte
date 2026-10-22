<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { lastPageOf, pageQuery } from '#lib/theme/pagination.js';
  import type { ListingTarget } from '#lib/theme/pagination.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    target: ListingTarget;
    page: number;
    total: number;
    pageSize: number;
  }

  let { target, page, total, pageSize }: Props = $props();

  const lastPage = $derived(lastPageOf({ total, pageSize }));
  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

{#snippet link(to: number, label: string, rel: 'prev' | 'next')}
  <!-- Route ids take no query string (`resolve('/(site)?page=2')` keeps the group name), so the query is appended. -->
  {@const path =
    'path' in target && target.path
      ? resolve(target.path as Path)
      : target.kind === 'home' || target.kind === 'search'
        ? resolve('/(site)')
        : target.kind === 'date'
          ? resolve('/(site)/date/[year]/[[month]]', {
              year: String(target.year),
              month: target.month
                ? String(target.month).padStart(2, '0')
                : undefined,
            })
          : target.kind === 'taxonomy'
            ? resolve('/(site)/taxonomy/[taxonomy]/[slug]', {
                taxonomy: target.taxonomy,
                slug: target.slug,
              })
            : target.kind === 'category'
              ? resolve('/(site)/category/[slug]', { slug: target.slug })
              : target.kind === 'author'
                ? resolve('/(site)/author/[slug]', { slug: target.slug })
                : target.kind === 'archive'
                  ? resolve('/(site)/archive/[type]', { type: target.slug })
                  : resolve('/(site)/tag/[slug]', { slug: target.slug })}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- `path` comes from resolve() -->
  <a
    {rel}
    class="rounded-md border px-3 py-1.5 hover:bg-muted"
    href={`${path}?${pageQuery(target, to)}`}>{label}</a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

{#if lastPage > 1}
  <nav
    aria-label={m.pagination}
    class="mt-12 flex items-center justify-between gap-4 text-sm"
  >
    {#if page > 1}{@render link(page - 1, m.newer, 'prev')}{:else}<span
      ></span>{/if}
    <span class="text-muted-foreground">{m.pageOf(page, lastPage)}</span>
    {#if page < lastPage}{@render link(page + 1, m.older, 'next')}{:else}<span
      ></span>{/if}
  </nav>
{/if}
