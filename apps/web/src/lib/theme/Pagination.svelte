<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { lastPageOf, pageWindow } from '#lib/theme/pagination.js';
  import { listingPath } from '#lib/seo/paths.js';
  import type { ListingTarget } from '#lib/theme/pagination.js';
  import { useI18n } from '#lib/i18n/context.js';

  interface Props {
    target: ListingTarget;
    page: number;
    total: number;
    pageSize: number;
  }

  let { target, page, total, pageSize }: Props = $props();

  const lastPage = $derived(lastPageOf({ total, pageSize }));
  const numbers = $derived(pageWindow(page, lastPage));
  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

{#snippet link(to: number, label: string, rel?: 'prev' | 'next')}
  <a
    {rel}
    aria-current={to === page ? 'page' : undefined}
    class="rounded-md border px-3 py-1.5 hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-semibold"
    href={resolve(listingPath(target, to) as Path)}>{label}</a
  >
{/snippet}

{#if lastPage > 1}
  <nav
    aria-label={m.pagination}
    class="mt-12 flex items-center justify-between gap-4 text-sm"
  >
    {#if page > 1}{@render link(page - 1, m.newer, 'prev')}{:else}<span
      ></span>{/if}
    <div class="flex flex-wrap items-center gap-2">
      {#each numbers as number, index (number)}{#if index > 0 && number - numbers[index - 1]! > 1}<span
            aria-hidden="true">…</span
          >{/if}{@render link(number, String(number))}{/each}
    </div>
    {#if page < lastPage}{@render link(page + 1, m.older, 'next')}{:else}<span
      ></span>{/if}
  </nav>
{/if}
