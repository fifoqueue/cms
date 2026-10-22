<script lang="ts">
  import { resolve } from '$app/paths';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { CONTENT_STATUSES } from '@cms/sdk';
  import { Plus, Search } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { flattenTree } from '#lib/admin/taxonomy-tree.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '#lib/components/ui/table/index.js';
  import { statusLabel, typeLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const trash = $derived(data.filter.view === 'trash');

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
      if (value !== undefined && value !== 'active')
        params.set(key, String(value));
    }
    return `?${params}`;
  };

  let selected = $state<string[]>([]);
  const allSelected = $derived(
    data.content.items.length > 0 &&
      selected.length === data.content.items.length,
  );

  const confirmBulk: SubmitFunction = ({ formData, cancel }) => {
    if (formData.get('action') === 'delete' && !confirm(m.confirmDelete))
      cancel();
    return ({ update }) => {
      selected = [];
      return update();
    };
  };

  const categoryRows = $derived(flattenTree(data.categories));
  const tagOptions = $derived(
    [...data.tags].sort((a, b) => a.name.localeCompare(b.name)),
  );
  const filtered = $derived(
    Boolean(
      data.filter.q ||
      data.filter.category ||
      data.filter.tag ||
      data.filter.taxonomy,
    ),
  );
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(i18n.language) : '—';
</script>

<svelte:head><title>{m.contentTitle}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">{m.contentTitle}</h1>
  <Button href={resolve('/admin/(app)/content/new')}
    ><Plus class="size-4" /> {m.contentNew}</Button
  >
</div>

<nav class="flex flex-wrap gap-2 text-sm" aria-label={m.columnStatus}>
  <a
    href={resolve(
      `/admin/(app)/content${query({ status: undefined, view: undefined, page: 1 })}`,
    )}
    aria-current={!data.filter.status && !trash}
    class="filter">{m.anyStatus}</a
  >
  {#each CONTENT_STATUSES as status (status)}
    <a
      href={resolve(
        `/admin/(app)/content${query({ status, view: undefined, page: 1 })}`,
      )}
      aria-current={data.filter.status === status && !trash}
      class="filter">{statusLabel(m, status)}</a
    >
  {/each}
  <a
    href={resolve(
      `/admin/(app)/content${query({ status: undefined, view: 'trash', page: 1 })}`,
    )}
    aria-current={trash}
    class="filter">{m.trashView}</a
  >
  <span class="mx-2 text-muted-foreground">|</span>
  <a
    href={resolve(`/admin/(app)/content${query({ type: undefined, page: 1 })}`)}
    aria-current={!data.filter.type}
    class="filter">{m.allTypes}</a
  >
  {#each data.types as type (type.key)}
    <a
      href={resolve(
        `/admin/(app)/content${query({ type: type.key, page: 1 })}`,
      )}
      aria-current={data.filter.type === type.key}
      class="filter">{type.builtin ? typeLabel(m, type.key) : type.name}</a
    >
  {/each}
</nav>

<form
  method="GET"
  role="search"
  class="flex flex-wrap items-end gap-2"
  aria-label={m.filter}
>
  {#each ['type', 'status', 'view', 'taxonomy', 'term'] as const as key (key)}
    {#if data.filter[key] && data.filter[key] !== 'active'}
      <input type="hidden" name={key} value={data.filter[key]} />
    {/if}
  {/each}
  <label class="grid gap-1 text-sm">
    <span class="sr-only">{m.searchContent}</span>
    <Input
      name="q"
      type="search"
      maxlength={200}
      placeholder={m.searchContent}
      value={data.filter.q ?? ''}
      class="w-56"
    />
  </label>
  <label class="grid gap-1 text-sm">
    <span class="sr-only">{m.columnCategories}</span>
    <NativeSelect name="category" value={data.filter.category ?? ''}>
      <NativeSelectOption value="">{m.allCategories}</NativeSelectOption>
      {#each categoryRows as { term, depth } (term.id)}
        <NativeSelectOption value={term.slug}
          >{'— '.repeat(depth)}{term.name}</NativeSelectOption
        >
      {/each}
    </NativeSelect>
  </label>
  <label class="grid gap-1 text-sm">
    <span class="sr-only">{m.columnTags}</span>
    <NativeSelect name="tag" value={data.filter.tag ?? ''}>
      <NativeSelectOption value="">{m.allTags}</NativeSelectOption>
      {#each tagOptions as tag (tag.id)}
        <NativeSelectOption value={tag.slug}>{tag.name}</NativeSelectOption>
      {/each}
    </NativeSelect>
  </label>
  <Button type="submit" variant="outline"
    ><Search class="size-4" /> {m.filter}</Button
  >
  {#if filtered}
    <Button
      variant="ghost"
      href={resolve(
        `/admin/(app)/content${query({ q: undefined, category: undefined, tag: undefined, taxonomy: undefined, term: undefined, page: 1 })}`,
      )}>{m.clear}</Button
    >
  {/if}
</form>

<FormMessage {form} />

<form method="POST" action="?/bulk" use:enhance={confirmBulk} class="space-y-2">
  <div class="flex flex-wrap items-center gap-2">
    <label class="sr-only" for="bulk-action">{m.bulkActions}</label>
    <NativeSelect id="bulk-action" name="action" size="sm">
      {#if trash}
        <NativeSelectOption value="restore">{m.restore}</NativeSelectOption>
        <NativeSelectOption value="delete"
          >{m.deletePermanently}</NativeSelectOption
        >
      {:else}
        <NativeSelectOption value="trash">{m.moveToTrash}</NativeSelectOption>
      {/if}
    </NativeSelect>
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={!selected.length}>{m.apply}</Button
    >
  </div>

  <div class="rounded-md border bg-background">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-8">
            <input
              type="checkbox"
              aria-label={m.selectAll}
              checked={allSelected}
              onchange={(event) =>
                (selected = event.currentTarget.checked
                  ? data.content.items.map((item) => item.id)
                  : [])}
            />
          </TableHead>
          <TableHead>{m.columnTitle}</TableHead>
          <TableHead class="hidden md:table-cell">{m.columnAuthor}</TableHead>
          <TableHead class="hidden lg:table-cell"
            >{m.columnCategories}</TableHead
          >
          <TableHead>{m.columnStatus}</TableHead>
          <TableHead>{m.columnDate}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each data.content.items as item (item.id)}
          <TableRow>
            <TableCell>
              <input
                type="checkbox"
                name="ids"
                value={item.id}
                aria-label={m.selectItem(item.title)}
                bind:group={selected}
              />
            </TableCell>
            <TableCell>
              <a
                href={resolve('/admin/(app)/content/[id]', { id: item.id })}
                class="font-medium hover:underline">{item.title}</a
              >
              <span class="ml-1 inline-flex gap-1 align-middle">
                {#if item.sticky}<Badge variant="outline">{m.sticky}</Badge
                  >{/if}
                {#if item.protected}<Badge variant="outline"
                    >{m.protectedBadge}</Badge
                  >{/if}
              </span>
              <p class="text-xs text-muted-foreground">
                {typeLabel(m, item.type)} · /{item.slug}
              </p>
            </TableCell>
            <TableCell class="hidden text-sm md:table-cell"
              >{item.authorName}</TableCell
            >
            <TableCell class="hidden text-sm lg:table-cell">
              {#each item.categories as category, index (category.id)}{index
                  ? ', '
                  : ''}<a
                  href={resolve(
                    `/admin/(app)/content${query({ category: category.slug, page: 1 })}`,
                  )}
                  class="hover:underline">{category.name}</a
                >{:else}<span class="text-muted-foreground">—</span>{/each}
            </TableCell>
            <TableCell>
              <Badge
                variant={item.status === 'published' ? 'default' : 'secondary'}
                >{statusLabel(m, item.status)}</Badge
              >
            </TableCell>
            <TableCell class="text-sm text-muted-foreground">
              {#if item.trashedAt}
                {m.trashedOn(date(item.trashedAt))}
              {:else}
                {date(item.publishedAt ?? item.updatedAt)}
              {/if}
            </TableCell>
          </TableRow>
        {:else}
          <TableRow>
            <TableCell
              colspan={6}
              class="py-10 text-center text-muted-foreground"
              >{trash
                ? m.emptyTrash
                : filtered
                  ? m.noMatches
                  : m.noContent}</TableCell
            >
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  </div>
</form>

{#if lastPage > 1}
  <div class="flex justify-between text-sm">
    {#if data.content.page > 1}<a
        href={resolve(
          `/admin/(app)/content${query({ page: data.content.page - 1 })}`,
        )}>{m.previous}</a
      >{:else}<span></span>{/if}
    <span class="text-muted-foreground"
      >{m.pageOf(data.content.page, lastPage)}</span
    >
    {#if data.content.page < lastPage}<a
        href={resolve(
          `/admin/(app)/content${query({ page: data.content.page + 1 })}`,
        )}>{m.next}</a
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
