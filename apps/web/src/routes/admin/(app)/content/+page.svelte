<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { CONTENT_STATUSES } from '@cms/sdk';
  import { Plus, Search } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import QuickEdit from '#lib/admin/QuickEdit.svelte';
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
  import {
    pluralLabel,
    statusLabel,
    typeLabel,
    useI18n,
  } from '#lib/i18n/index.js';
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

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };

  /** The entry whose Quick Edit row is open. */
  let editing = $state<string | null>(null);
  const quickForm = $derived(
    form && 'quickEdit' in form
      ? (form as typeof form & { quickEdit: string })
      : null,
  );

  const typeInfo = $derived(
    data.types.find((type) => type.key === data.filter.type),
  );

  const heading = $derived(
    typeInfo ? pluralLabel(m, typeInfo) : m.contentTitle,
  );

  /** A status view is listed while it has entries (or is the current one). */
  const listed = (count: number | null, current: boolean) =>
    current || count === null || count > 0;

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
      data.filter.taxonomy ||
      data.filter.author ||
      data.filter.m,
    ),
  );
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(i18n.language) : '—';
</script>

<svelte:head><title>{heading}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">
    {heading}
  </h1>
  <Button
    href={data.filter.type
      ? resolve(
          `/admin/(app)/content/new?type=${encodeURIComponent(data.filter.type)}`,
        )
      : resolve('/admin/(app)/content/new')}
    ><Plus class="size-4" /> {m.contentNew}</Button
  >
</div>

{#snippet count(value: number | null)}{#if value !== null}
    <span class="text-muted-foreground">({value})</span>{/if}{/snippet}

<nav class="flex flex-wrap gap-2 text-sm" aria-label={m.columnStatus}>
  <a
    href={resolve(
      `/admin/(app)/content${query({ status: undefined, view: undefined, page: 1 })}`,
    )}
    aria-current={!data.filter.status && !trash}
    class="filter">{m.anyStatus} {@render count(data.counts.all)}</a
  >
  {#each CONTENT_STATUSES as status (status)}
    {@const current = data.filter.status === status && !trash}
    {#if listed(data.counts[status], current)}
      <a
        href={resolve(
          `/admin/(app)/content${query({ status, view: undefined, page: 1 })}`,
        )}
        aria-current={current}
        class="filter"
        >{statusLabel(m, status)} {@render count(data.counts[status])}</a
      >
    {/if}
  {/each}
  {#if listed(data.counts.trash, trash)}
    <a
      href={resolve(
        `/admin/(app)/content${query({ status: undefined, view: 'trash', page: 1 })}`,
      )}
      aria-current={trash}
      class="filter">{m.trashView} {@render count(data.counts.trash)}</a
    >
  {/if}
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
    <span class="sr-only">{m.contentMonth}</span>
    <Input
      name="m"
      type="month"
      value={data.filter.m ?? ''}
      class="w-44"
      aria-label={m.contentMonth}
    />
  </label>
  {#if data.authors}
    <label class="grid gap-1 text-sm">
      <span class="sr-only">{m.columnAuthor}</span>
      <NativeSelect name="author" value={data.filter.author ?? ''}>
        <NativeSelectOption value="">{m.allAuthors}</NativeSelectOption>
        {#each data.authors as author (author.id)}
          <NativeSelectOption value={author.slug}
            >{author.name}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    </label>
  {/if}
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
        `/admin/(app)/content${query({ q: undefined, category: undefined, tag: undefined, taxonomy: undefined, term: undefined, author: undefined, m: undefined, page: 1 })}`,
      )}>{m.clear}</Button
    >
  {/if}
</form>

{#if !quickForm}<FormMessage {form} />{/if}

<!-- The row checkboxes belong to this form through their `form` attribute, so rows can hold their own forms. -->
<form
  id="bulk"
  method="POST"
  action="?/bulk"
  use:enhance={confirmBulk}
  class="flex flex-wrap items-center gap-2"
>
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
  <Button type="submit" variant="outline" size="sm" disabled={!selected.length}
    >{m.apply}</Button
  >
</form>

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
        <TableHead class="hidden lg:table-cell">{m.columnCategories}</TableHead>
        <TableHead>{m.columnStatus}</TableHead>
        <TableHead>{m.columnDate}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each data.content.items as item (item.id)}
        {#if editing === item.id}
          {@const type = data.types.find((option) => option.key === item.type)}
          <TableRow>
            <TableCell colspan={6} class="bg-muted/40 whitespace-normal">
              <QuickEdit
                entry={item}
                categories={type?.categories ? categoryRows : []}
                tags={type?.tags ? tagOptions : []}
                authors={data.authors}
                canPublish={data.canPublish}
                form={quickForm?.quickEdit === item.id ? quickForm : null}
                onclose={() => (editing = null)}
              />
            </TableCell>
          </TableRow>
        {:else}
          <TableRow>
            <TableCell class="align-top">
              <input
                type="checkbox"
                form="bulk"
                name="ids"
                value={item.id}
                aria-label={m.selectItem(item.title)}
                bind:group={selected}
              />
            </TableCell>
            <TableCell class="whitespace-normal">
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
              <div
                class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
              >
                {#if item.trashedAt}
                  <form method="POST" action="?/restore" use:enhance>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" class="row-action text-primary"
                      >{m.restore}</button
                    >
                  </form>
                  <form
                    method="POST"
                    action="?/delete"
                    use:enhance={confirmDelete}
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" class="row-action text-destructive"
                      >{m.deletePermanently}</button
                    >
                  </form>
                {:else}
                  <a
                    href={resolve('/admin/(app)/content/[id]', {
                      id: item.id,
                    })}
                    class="row-action text-primary">{m.edit}</a
                  >
                  <button
                    type="button"
                    class="row-action text-primary"
                    aria-label={m.rowQuickEditOf(item.title)}
                    onclick={() => (editing = item.id)}>{m.rowQuickEdit}</button
                  >
                  <form method="POST" action="?/trash" use:enhance>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" class="row-action text-destructive"
                      >{m.rowTrash}</button
                    >
                  </form>
                  {#if item.status === 'published'}
                    <a
                      href={resolve(item.path as Path)}
                      target="_blank"
                      class="row-action text-primary">{m.view}</a
                    >
                  {:else}
                    <!-- Not enhanced: the browser follows the redirect into the new tab. -->
                    <form
                      method="POST"
                      action="{resolve('/admin/(app)/content/[id]', {
                        id: item.id,
                      })}?/preview"
                      target="_blank"
                    >
                      <button type="submit" class="row-action text-primary"
                        >{m.preview}</button
                      >
                    </form>
                  {/if}
                {/if}
              </div>
            </TableCell>
            <TableCell class="hidden align-top text-sm md:table-cell"
              >{item.authorName}</TableCell
            >
            <TableCell class="hidden align-top text-sm lg:table-cell">
              {#each item.categories as category, index (category.id)}{index
                  ? ', '
                  : ''}<a
                  href={resolve(
                    `/admin/(app)/content${query({ category: category.slug, page: 1 })}`,
                  )}
                  class="hover:underline">{category.name}</a
                >{:else}<span class="text-muted-foreground">—</span>{/each}
            </TableCell>
            <TableCell class="align-top">
              <Badge
                variant={item.status === 'published' ? 'default' : 'secondary'}
                >{statusLabel(m, item.status)}</Badge
              >
            </TableCell>
            <TableCell class="align-top text-sm text-muted-foreground">
              {#if item.trashedAt}
                {m.trashedOn(date(item.trashedAt))}
              {:else}
                {date(item.publishedAt ?? item.updatedAt)}
              {/if}
            </TableCell>
          </TableRow>
        {/if}
      {:else}
        <TableRow>
          <TableCell colspan={6} class="py-10 text-center text-muted-foreground"
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
  .row-action {
    cursor: pointer;
  }
  .row-action:hover {
    text-decoration: underline;
  }
</style>
