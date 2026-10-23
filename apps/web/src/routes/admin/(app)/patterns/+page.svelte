<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { PatternSummary } from '@cms/sdk';
  import { can } from '@cms/sdk/capabilities';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { statusLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  /** Own patterns, or every pattern with `content.editOthers` (the API checks again). */
  const editable = (pattern: PatternSummary) =>
    pattern.authorId === data.user.id
      ? pattern.status === 'draft' || can(data.user, 'content.publish')
      : can(data.user, 'content.editOthers');
  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };
</script>

<svelte:head><title>{m.patternsTitle}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">{m.patternsTitle}</h1>
  <Button href={resolve('/admin/(app)/patterns/[id]', { id: 'new' })}
    >{m.patternAdd}</Button
  >
</div>
<p class="text-sm text-muted-foreground">{m.patternUsage}</p>
<FormMessage {form} />
<form method="GET" class="flex gap-2">
  <input
    type="search"
    name="search"
    value={data.search}
    maxlength="191"
    aria-label={m.search}
    class="rounded-md border px-3 py-2"
  />
  <Button type="submit" variant="outline">{m.search}</Button>
</form>

{#if data.patterns.length}
  <ul class="divide-y rounded-md border bg-background">
    {#each data.patterns as pattern (pattern.id)}
      <li class="flex flex-wrap items-center justify-between gap-3 p-3">
        <div class="flex flex-wrap items-center gap-2">
          {#if editable(pattern)}
            <a
              href={resolve('/admin/(app)/patterns/[id]', { id: pattern.id })}
              class="font-medium hover:underline">{pattern.title}</a
            >
          {:else}
            <span class="font-medium">{pattern.title}</span>
          {/if}
          {#if pattern.synced}<Badge variant="secondary"
              >{m.patternSyncedShort}</Badge
            >{/if}
          {#if pattern.status === 'draft'}<Badge variant="outline"
              >{statusLabel(m, 'draft')}</Badge
            >{/if}
        </div>
        {#if editable(pattern)}
          <form method="POST" action="?/delete" use:enhance={confirmDelete}>
            <input type="hidden" name="id" value={pattern.id} />
            <Button type="submit" variant="ghost" size="sm">{m.delete}</Button>
          </form>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="text-sm text-muted-foreground">{m.patternNone}</p>
{/if}

{#if data.pages > 1}
  <div class="flex justify-between text-sm">
    {#if data.page > 1}<a
        href={resolve(
          `/admin/(app)/patterns?${new URLSearchParams({ page: String(data.page - 1), search: data.search })}`,
        )}>{m.previous}</a
      >{:else}<span></span>{/if}
    <span>{m.pageOf(data.page, data.pages)}</span>
    {#if data.page < data.pages}<a
        href={resolve(
          `/admin/(app)/patterns?${new URLSearchParams({ page: String(data.page + 1), search: data.search })}`,
        )}>{m.next}</a
      >{:else}<span></span>{/if}
  </div>
{/if}
