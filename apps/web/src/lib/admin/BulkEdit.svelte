<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { BULK_STATUSES } from '#lib/admin/bulk-edit.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { statusLabel, useI18n } from '#lib/i18n/index.js';

  interface Choice {
    id: string;
    name: string;
  }

  let {
    entries,
    categories,
    tags,
    authors,
    canPublish,
    onclose,
  }: {
    /** The selected entries, with the version the list showed. */
    entries: { id: string; title: string; updatedAt: string }[];
    categories: { term: Choice; depth: number }[];
    tags: Choice[];
    /** Null unless the user may assign other authors. */
    authors: Choice[] | null;
    canPublish: boolean;
    onclose: () => void;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  /** Publishing statuses only for users who may publish; the API checks again. */
  const statuses = $derived(
    BULK_STATUSES.filter(
      (status) => canPublish || status === 'draft' || status === 'pending',
    ),
  );

  const submit: SubmitFunction =
    () =>
    async ({ update }) => {
      await update();
      onclose();
    };
</script>

<form
  method="POST"
  action="?/bulkEdit"
  use:enhance={submit}
  class="grid gap-4 rounded-md border bg-muted/40 p-4"
  aria-labelledby="bulk-edit-title"
>
  <h2 id="bulk-edit-title" class="text-sm font-semibold">{m.bulkEditTitle}</h2>
  {#each entries as entry (entry.id)}
    <input type="hidden" name="ids" value={entry.id} />
    <input type="hidden" name="version:{entry.id}" value={entry.updatedAt} />
  {/each}
  <div class="grid gap-4 md:grid-cols-4">
    <div class="grid content-start gap-1">
      <p class="text-sm font-medium">{m.bulkEditSelected(entries.length)}</p>
      <ul
        class="max-h-48 overflow-y-auto rounded-md border bg-background p-2 text-sm"
      >
        {#each entries as entry (entry.id)}<li class="truncate">
            {entry.title}
          </li>{/each}
      </ul>
    </div>
    <fieldset class="grid content-start gap-1">
      <legend class="mb-1 text-sm font-medium">{m.bulkEditAddCategories}</legend
      >
      <div class="max-h-48 overflow-y-auto rounded-md border bg-background p-2">
        {#each categories as { term, depth } (term.id)}
          <label
            class="flex items-center gap-2 py-0.5 text-sm"
            style:padding-inline-start="{depth}rem"
          >
            <input type="checkbox" name="categoryIds" value={term.id} />
            {term.name}
          </label>
        {:else}
          <p class="text-sm text-muted-foreground">{m.noCategories}</p>
        {/each}
      </div>
    </fieldset>
    <fieldset class="grid content-start gap-1">
      <legend class="mb-1 text-sm font-medium">{m.bulkEditAddTags}</legend>
      <div class="max-h-48 overflow-y-auto rounded-md border bg-background p-2">
        {#each tags as tag (tag.id)}
          <label class="flex items-center gap-2 py-0.5 text-sm">
            <input type="checkbox" name="tagIds" value={tag.id} />
            {tag.name}
          </label>
        {:else}
          <p class="text-sm text-muted-foreground">{m.noTags}</p>
        {/each}
      </div>
    </fieldset>
    <div class="grid content-start gap-3">
      {#if authors}
        <div class="grid gap-1">
          <Label for="bulk-author">{m.fieldAuthor}</Label>
          <NativeSelect id="bulk-author" name="authorId">
            <NativeSelectOption value="">{m.noChange}</NativeSelectOption>
            {#each authors as author (author.id)}
              <NativeSelectOption value={author.id}
                >{author.name}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>
      {/if}
      <div class="grid gap-1">
        <Label for="bulk-status">{m.fieldStatus}</Label>
        <NativeSelect id="bulk-status" name="status">
          <NativeSelectOption value="">{m.noChange}</NativeSelectOption>
          {#each statuses as status (status)}
            <NativeSelectOption value={status}
              >{statusLabel(m, status)}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <div class="grid gap-1">
        <Label for="bulk-comments">{m.fieldAllowComments}</Label>
        <NativeSelect id="bulk-comments" name="comments">
          <NativeSelectOption value="">{m.noChange}</NativeSelectOption>
          <NativeSelectOption value="open"
            >{m.bulkCommentsOpen}</NativeSelectOption
          >
          <NativeSelectOption value="closed"
            >{m.bulkCommentsClosed}</NativeSelectOption
          >
        </NativeSelect>
      </div>
      <div class="grid gap-1">
        <Label for="bulk-sticky">{m.sticky}</Label>
        <NativeSelect id="bulk-sticky" name="sticky">
          <NativeSelectOption value="">{m.noChange}</NativeSelectOption>
          <NativeSelectOption value="sticky">{m.bulkSticky}</NativeSelectOption>
          <NativeSelectOption value="unsticky"
            >{m.bulkNotSticky}</NativeSelectOption
          >
        </NativeSelect>
      </div>
    </div>
  </div>
  <div class="flex flex-wrap gap-2">
    <Button type="submit" size="sm">{m.update}</Button>
    <Button type="button" size="sm" variant="outline" onclick={onclose}
      >{m.cancel}</Button
    >
  </div>
</form>
