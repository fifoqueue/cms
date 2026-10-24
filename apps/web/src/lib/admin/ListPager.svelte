<script lang="ts">
  import { resolve } from '$app/paths';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    route,
    list,
    query,
  }: {
    route:
      '/admin/(app)/media' | '/admin/(app)/comments' | '/admin/(app)/content';
    list: { page: number; total: number; pageSize: number };
    /** The list's query string for another page. */
    query: (changes: { page: number }) => `?${string}`;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const lastPage = $derived(Math.max(1, Math.ceil(list.total / list.pageSize)));
</script>

{#if lastPage > 1}
  <div class="flex justify-between text-sm">
    {#if list.page > 1}<a
        href={resolve(`${route}${query({ page: list.page - 1 })}`)}
        >{m.previous}</a
      >{:else}<span></span>{/if}
    <span class="text-muted-foreground">{m.pageOf(list.page, lastPage)}</span>
    {#if list.page < lastPage}<a
        href={resolve(`${route}${query({ page: list.page + 1 })}`)}>{m.next}</a
      >{:else}<span></span>{/if}
  </div>
{/if}
