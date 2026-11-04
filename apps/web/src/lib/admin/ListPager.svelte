<script lang="ts">
  import { resolve } from '$app/paths';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    route,
    base,
    list,
    query,
  }: {
    route?:
      '/admin/(app)/media' | '/admin/(app)/comments' | '/admin/(app)/content';
    /** An already resolved path the query string is appended to, instead of `route`. */
    base?: string;
    list: { page: number; total: number; pageSize: number };
    /** The list's query string for another page. */
    query: (changes: { page: number }) => `?${string}`;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const lastPage = $derived(Math.max(1, Math.ceil(list.total / list.pageSize)));
  const at = (page: number) =>
    base !== undefined
      ? `${base}${query({ page })}`
      : resolve(`${route!}${query({ page })}`);
</script>

{#if lastPage > 1}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- `at` resolves the path before adding the page query -->
  <div class="flex justify-between text-sm">
    {#if list.page > 1}<a href={at(list.page - 1)}>{m.previous}</a>{:else}<span
      ></span>{/if}
    <span class="text-muted-foreground">{m.pageOf(list.page, lastPage)}</span>
    {#if list.page < lastPage}<a href={at(list.page + 1)}>{m.next}</a
      >{:else}<span></span>{/if}
  </div>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
