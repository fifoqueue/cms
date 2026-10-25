<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { listQuery } from '#lib/admin/list-query.js';
  import ListPager from '#lib/admin/ListPager.svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { CONTENT_STATUSES, UNPUBLISHED_STATUSES } from '@cms/sdk';
  import type { ContentOrder, ContentStatus } from '@cms/sdk';
  import { can } from '@cms/sdk/capabilities';
  import { default as Plus } from '@lucide/svelte/icons/plus';
  import { default as Search } from '@lucide/svelte/icons/search';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import BulkEdit from '#lib/admin/BulkEdit.svelte';
  import BulkReport from '#lib/admin/BulkReport.svelte';
  import QuickEdit from '#lib/admin/QuickEdit.svelte';
  import ScreenOptions from '#lib/admin/ScreenOptions.svelte';
  import { CONTENT_COLUMNS } from '#lib/admin/screen-options.js';
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

  const query = (
    changes: Record<string, string | number | undefined>,
  ): `?${string}` =>
    listQuery(
      Object.fromEntries(
        Object.entries({
          ...data.filter,
          page: data.content.page,
          ...changes,
        }).filter(([, value]) => value !== 'active'),
      ),
      {},
    );

  let selected = $state<string[]>([]);
  const selectable = $derived(
    data.content.items.filter((item) => canEdit(item)).map((item) => item.id),
  );
  const allSelected = $derived(
    selectable.length > 0 && selected.length === selectable.length,
  );

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };

  /** The API's edit rule (`assertEditable`), so rows only offer what the user may do. */
  const canEdit = (item: { authorId: string; status: ContentStatus }) =>
    item.authorId === data.user.id
      ? UNPUBLISHED_STATUSES.includes(item.status) ||
        can(data.user, 'content.publish')
      : can(data.user, 'content.editOthers');

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

  /** The list's sort: modified, newest first, unless a column was chosen. */
  const direction = $derived(data.filter.order ?? 'desc');
  const ariaSort = (column: ContentOrder) =>
    (data.filter.orderby ?? 'updatedAt') === column
      ? direction === 'asc'
        ? 'ascending'
        : 'descending'
      : undefined;

  /** A status view is listed while it has entries (or is the current one). */
  const listed = (count: number | null, current: boolean) =>
    current || count === null || count > 0;

  /** Bulk Edit panel, opened by the "Edit" bulk action. */
  let bulkEditing = $state(false);
  const bulkEntries = $derived(
    data.content.items.filter((item) => selected.includes(item.id)),
  );
  const bulkResult = $derived(
    form && 'bulk' in form
      ? (form.bulk as {
          done: number;
          failed: { id: string; message: string }[];
        })
      : null,
  );
  const titles = $derived(
    new Map(data.content.items.map((item) => [item.id, item.title])),
  );

  const hidden = $derived(new Set<string>(data.screen.hidden));
  const columnLabels = $derived({
    author: m.columnAuthor,
    categories: m.columnCategories,
    tags: m.columnTags,
    comments: m.navComments,
    status: m.columnStatus,
    date: m.columnDate,
    modified: m.columnModified,
  });
  /** Title and checkbox are always shown; colspan of full-width rows. */
  const span = $derived(
    2 + CONTENT_COLUMNS.filter((key) => !hidden.has(key)).length,
  );

  const confirmBulk: SubmitFunction = ({ formData, cancel }) => {
    if (formData.get('action') === 'edit') {
      cancel();
      bulkEditing = true;
      return;
    }
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

<ScreenOptions
  screen="content"
  columns={CONTENT_COLUMNS.map((key) => ({ key, label: columnLabels[key] }))}
  hidden={data.screen.hidden}
  perPage={data.screen.perPage}
/>

{#snippet sortLink(column: ContentOrder, label: string)}
  {@const current = (data.filter.orderby ?? 'updatedAt') === column}
  <a
    href={resolve(
      `/admin/(app)/content${query({ orderby: column, order: current ? (direction === 'asc' ? 'desc' : 'asc') : column === 'title' || column === 'author' ? 'asc' : 'desc', page: 1 })}`,
    )}
    class="inline-flex items-center gap-1 hover:underline"
    >{label}{#if current}<span aria-hidden="true"
        >{direction === 'asc' ? '▲' : '▼'}</span
      >{/if}</a
  >
{/snippet}

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
      min="1970-01"
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
<BulkReport result={bulkResult} names={titles} />

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
    {:else}
      <NativeSelectOption value="edit">{m.edit}</NativeSelectOption>
      <NativeSelectOption value="trash">{m.moveToTrash}</NativeSelectOption>
    {/if}
    <NativeSelectOption value="delete">{m.deletePermanently}</NativeSelectOption
    >
  </NativeSelect>
  <Button type="submit" variant="outline" size="sm" disabled={!selected.length}
    >{m.apply}</Button
  >
</form>

{#if bulkEditing && bulkEntries.length}
  <BulkEdit
    entries={bulkEntries}
    categories={categoryRows}
    tags={tagOptions}
    authors={data.authors}
    canPublish={data.canPublish}
    onclose={() => {
      bulkEditing = false;
      selected = [];
    }}
  />
{/if}

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
              (selected = event.currentTarget.checked ? selectable : [])}
          />
        </TableHead>
        <TableHead aria-sort={ariaSort('title')}
          >{@render sortLink('title', m.columnTitle)}</TableHead
        >
        {#if !hidden.has('author')}<TableHead
            class="hidden md:table-cell"
            aria-sort={ariaSort('author')}
            >{@render sortLink('author', m.columnAuthor)}</TableHead
          >{/if}
        {#if !hidden.has('categories')}<TableHead class="hidden lg:table-cell"
            >{m.columnCategories}</TableHead
          >{/if}
        {#if !hidden.has('tags')}<TableHead class="hidden lg:table-cell"
            >{m.columnTags}</TableHead
          >{/if}
        {#if !hidden.has('comments')}<TableHead
            class="hidden text-right md:table-cell"
            aria-sort={ariaSort('commentCount')}
            >{@render sortLink('commentCount', m.navComments)}</TableHead
          >{/if}
        {#if !hidden.has('status')}<TableHead>{m.columnStatus}</TableHead>{/if}
        {#if !hidden.has('date')}<TableHead aria-sort={ariaSort('publishedAt')}
            >{@render sortLink('publishedAt', m.columnDate)}</TableHead
          >{/if}
        {#if !hidden.has('modified')}<TableHead
            class="hidden xl:table-cell"
            aria-sort={ariaSort('updatedAt')}
            >{@render sortLink('updatedAt', m.columnModified)}</TableHead
          >{/if}
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each data.content.items as item (item.id)}
        {#if editing === item.id}
          {@const type = data.types.find((option) => option.key === item.type)}
          <TableRow>
            <TableCell colspan={span} class="bg-muted/40 whitespace-normal">
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
          {@const editable = canEdit(item)}
          <TableRow>
            <TableCell class="align-top">
              {#if editable}
                <input
                  type="checkbox"
                  form="bulk"
                  name="ids"
                  value={item.id}
                  aria-label={m.selectItem(item.title)}
                  bind:group={selected}
                />
              {/if}
            </TableCell>
            <TableCell class="whitespace-normal">
              {#if editable}
                <a
                  href={resolve('/admin/(app)/content/[id]', { id: item.id })}
                  class="font-medium hover:underline">{item.title}</a
                >
              {:else}
                <span class="font-medium">{item.title}</span>
              {/if}
              <span class="ml-1 inline-flex gap-1 align-middle">
                {#if item.sticky}<Badge variant="outline">{m.sticky}</Badge
                  >{/if}
                {#if item.inactiveType}<Badge variant="secondary"
                    >{m.contentInactiveType}</Badge
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
                {#if !editable}
                  {#if item.status === 'published' && !item.trashedAt}
                    <a
                      href={resolve(item.path as Path)}
                      target="_blank"
                      class="row-action text-primary">{m.view}</a
                    >
                  {/if}
                {:else if item.trashedAt}
                  <form method="POST" action="?/restore" use:enhance>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" class="row-action text-primary"
                      >{m.restore}</button
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
                {#if editable}
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
                {/if}
              </div>
            </TableCell>
            {#if !hidden.has('author')}
              <TableCell class="hidden align-top text-sm md:table-cell"
                >{item.authorName}</TableCell
              >
            {/if}
            {#if !hidden.has('categories')}
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
            {/if}
            {#if !hidden.has('tags')}
              <TableCell class="hidden align-top text-sm lg:table-cell">
                {#each item.tags as tag, index (tag.id)}{index ? ', ' : ''}<a
                    href={resolve(
                      `/admin/(app)/content${query({ tag: tag.slug, page: 1 })}`,
                    )}
                    class="hover:underline">{tag.name}</a
                  >{:else}<span class="text-muted-foreground">—</span>{/each}
              </TableCell>
            {/if}
            {#if !hidden.has('comments')}
              <TableCell
                class="hidden text-right align-top text-sm md:table-cell"
              >
                {#if item.commentCount}
                  <a
                    href={resolve(
                      `/admin/(app)/comments?contentId=${encodeURIComponent(item.id)}`,
                    )}
                    class="hover:underline">{item.commentCount}</a
                  >
                {:else}<span class="text-muted-foreground">—</span>{/if}
              </TableCell>
            {/if}
            {#if !hidden.has('status')}
              <TableCell class="align-top">
                <Badge
                  variant={item.status === 'published'
                    ? 'default'
                    : 'secondary'}>{statusLabel(m, item.status)}</Badge
                >
              </TableCell>
            {/if}
            {#if !hidden.has('date')}
              <TableCell class="align-top text-sm text-muted-foreground">
                {#if item.trashedAt}
                  {m.trashedOn(date(item.trashedAt))}
                {:else}
                  {date(item.publishedAt ?? item.updatedAt)}
                {/if}
              </TableCell>
            {/if}
            {#if !hidden.has('modified')}
              <TableCell
                class="hidden align-top text-sm text-muted-foreground xl:table-cell"
                >{date(item.updatedAt)}</TableCell
              >
            {/if}
          </TableRow>
        {/if}
      {:else}
        <TableRow>
          <TableCell
            colspan={span}
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

<ListPager route="/admin/(app)/content" list={data.content} {query} />

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
