<script lang="ts">
  import { resolve } from '$app/paths';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { CONTENT_STATUSES, CONTENT_TYPES } from '@cms/sdk';
  import { Plus, Trash2 } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '#lib/components/ui/table/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const lastPage = $derived(
    Math.max(1, Math.ceil(data.content.total / data.content.pageSize)),
  );

  const query = (
    changes: Record<string, string | number | undefined>,
  ): `?${string}` => {
    const params = new SvelteURLSearchParams();
    for (const [key, value] of Object.entries({
      ...data.filter,
      page: data.content.page,
      ...changes,
    })) {
      if (value !== undefined) params.set(key, String(value));
    }
    return `?${params}`;
  };

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm('Delete this item permanently?')) cancel();
  };
</script>

<svelte:head><title>Content</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">Content</h1>
  <Button href={resolve('/admin/(app)/content/new')}
    ><Plus class="size-4" /> New</Button
  >
</div>

<div class="flex flex-wrap gap-2 text-sm">
  <a
    href={resolve(`/admin/(app)/content${query({ type: undefined, page: 1 })}`)}
    aria-current={!data.filter.type}
    class="filter">All types</a
  >
  {#each CONTENT_TYPES as type (type)}
    <a
      href={resolve(`/admin/(app)/content${query({ type, page: 1 })}`)}
      aria-current={data.filter.type === type}
      class="filter">{type}</a
    >
  {/each}
  <span class="mx-2 text-muted-foreground">|</span>
  <a
    href={resolve(
      `/admin/(app)/content${query({ status: undefined, page: 1 })}`,
    )}
    aria-current={!data.filter.status}
    class="filter">Any status</a
  >
  {#each CONTENT_STATUSES as status (status)}
    <a
      href={resolve(`/admin/(app)/content${query({ status, page: 1 })}`)}
      aria-current={data.filter.status === status}
      class="filter">{status}</a
    >
  {/each}
</div>

<FormMessage {form} />

<div class="rounded-md border bg-background">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Title</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Updated</TableHead>
        <TableHead class="w-12"></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each data.content.items as item (item.id)}
        <TableRow>
          <TableCell>
            <a
              href={resolve('/admin/(app)/content/[id]', { id: item.id })}
              class="font-medium hover:underline">{item.title}</a
            >
            <p class="text-xs text-muted-foreground">/{item.slug}</p>
          </TableCell>
          <TableCell>{item.type}</TableCell>
          <TableCell>
            <Badge
              variant={item.status === 'published' ? 'default' : 'secondary'}
              >{item.status}</Badge
            >
          </TableCell>
          <TableCell class="text-sm text-muted-foreground"
            >{new Date(item.updatedAt).toLocaleString()}</TableCell
          >
          <TableCell>
            <form method="POST" action="?/delete" use:enhance={confirmDelete}>
              <input type="hidden" name="id" value={item.id} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="Delete {item.title}"
              >
                <Trash2 class="size-4" />
              </Button>
            </form>
          </TableCell>
        </TableRow>
      {:else}
        <TableRow>
          <TableCell colspan={5} class="py-10 text-center text-muted-foreground"
            >No content yet.</TableCell
          >
        </TableRow>
      {/each}
    </TableBody>
  </Table>
</div>

{#if lastPage > 1}
  <div class="flex justify-between text-sm">
    {#if data.content.page > 1}<a
        href={resolve(
          `/admin/(app)/content${query({ page: data.content.page - 1 })}`,
        )}>← Previous</a
      >{:else}<span></span>{/if}
    <span class="text-muted-foreground"
      >Page {data.content.page} of {lastPage}</span
    >
    {#if data.content.page < lastPage}<a
        href={resolve(
          `/admin/(app)/content${query({ page: data.content.page + 1 })}`,
        )}>Next →</a
      >{:else}<span></span>{/if}
  </div>
{/if}

<style>
  .filter {
    border-radius: var(--radius);
    padding: 0.25rem 0.75rem;
  }
  .filter[aria-current='true'] {
    background: var(--muted);
    font-weight: 500;
  }
</style>
