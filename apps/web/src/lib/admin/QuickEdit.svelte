<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { CONTENT_STATUSES, UNPUBLISHED_STATUSES } from '@cms/sdk';
  import type { AdminContentSummary } from '@cms/sdk';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
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
    entry,
    categories,
    tags,
    authors,
    canPublish,
    form,
    onclose,
  }: {
    entry: AdminContentSummary;
    /** Empty when the type has no categories (or tags); the list is then hidden. */
    categories: { term: Choice; depth: number }[];
    tags: Choice[];
    /** Null unless the user may assign other authors. */
    authors: Choice[] | null;
    canPublish: boolean;
    /** The failed Quick Edit result, when it was this entry's. */
    form: { message?: string; issues?: unknown } | null;
    onclose: () => void;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $derived(`quick-${entry.id}`);

  /** `datetime-local` value in the browser's zone for an ISO time. */
  const localTime = (iso: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  };

  // svelte-ignore state_referenced_locally
  const initialDate = localTime(entry.publishedAt);
  let date = $state(initialDate);
  /** Sent only when changed: an untouched date keeps the stored one (with its seconds). */
  const publishedAt = $derived(
    date && date !== initialDate ? new Date(date).toISOString() : '',
  );

  /** Statuses this user may choose; the current one stays listed so saving keeps it. */
  const statuses = $derived(
    CONTENT_STATUSES.filter(
      (option) =>
        canPublish ||
        UNPUBLISHED_STATUSES.includes(option) ||
        option === entry.status,
    ),
  );
  const assigned = $derived(
    new Set([...entry.categories, ...entry.tags].map((term) => term.id)),
  );

  const submit: SubmitFunction =
    () =>
    async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'success') onclose();
    };
</script>

<form
  method="POST"
  action="?/quickEdit"
  use:enhance={submit}
  class="grid gap-4 p-2 text-left"
  aria-labelledby="{id}-title"
>
  <h2 id="{id}-title" class="text-sm font-semibold">{m.rowQuickEdit}</h2>
  <FormMessage {form} />
  <input type="hidden" name="id" value={entry.id} />
  <input type="hidden" name="updatedAt" value={entry.updatedAt} />
  <input type="hidden" name="publishedAt" value={publishedAt} />
  <div class="grid gap-4 md:grid-cols-3">
    <div class="grid content-start gap-3">
      <div class="grid gap-1">
        <Label for="{id}-name">{m.fieldTitle}</Label>
        <Input
          id="{id}-name"
          name="title"
          required
          maxlength={255}
          value={entry.title}
        />
      </div>
      <div class="grid gap-1">
        <Label for="{id}-slug">{m.fieldSlug}</Label>
        <Input id="{id}-slug" name="slug" maxlength={191} value={entry.slug} />
      </div>
      <div class="grid gap-1">
        <Label for="{id}-date">{m.columnDate}</Label>
        <Input id="{id}-date" type="datetime-local" bind:value={date} />
      </div>
      <div class="grid gap-1">
        <Label for="{id}-password">{m.password}</Label>
        <Input
          id="{id}-password"
          name="password"
          type="password"
          autocomplete="new-password"
          maxlength={200}
          placeholder={entry.protected ? m.quickEditPasswordKept : ''}
        />
      </div>
      {#if authors}
        <div class="grid gap-1">
          <Label for="{id}-author">{m.fieldAuthor}</Label>
          <NativeSelect id="{id}-author" name="authorId" value={entry.authorId}>
            {#each authors as author (author.id)}
              <NativeSelectOption value={author.id}
                >{author.name}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>
      {/if}
    </div>

    {#if categories.length}
      <fieldset class="grid content-start gap-1">
        <legend class="mb-1 text-sm font-medium">{m.columnCategories}</legend>
        <div class="max-h-48 overflow-y-auto rounded-md border p-2">
          {#each categories as { term, depth } (term.id)}
            <label
              class="flex items-center gap-2 py-0.5 text-sm"
              style:padding-inline-start="{depth}rem"
            >
              <input
                type="checkbox"
                name="categoryIds"
                value={term.id}
                checked={assigned.has(term.id)}
              />
              {term.name}
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

    <div class="grid content-start gap-3">
      {#if tags.length}
        <fieldset class="grid gap-1">
          <legend class="mb-1 text-sm font-medium">{m.columnTags}</legend>
          <div class="max-h-32 overflow-y-auto rounded-md border p-2">
            {#each tags as tag (tag.id)}
              <label class="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  name="tagIds"
                  value={tag.id}
                  checked={assigned.has(tag.id)}
                />
                {tag.name}
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}
      <div class="grid gap-1">
        <Label for="{id}-status">{m.fieldStatus}</Label>
        <NativeSelect id="{id}-status" name="status" value={entry.status}>
          {#each statuses as option (option)}
            <NativeSelectOption value={option}
              >{statusLabel(m, option)}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sticky" checked={entry.sticky} />
        {m.fieldSticky}
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="allowComments"
          checked={entry.allowComments}
        />
        {m.fieldAllowComments}
      </label>
    </div>
  </div>
  <div class="flex flex-wrap gap-2">
    <Button type="submit" size="sm">{m.update}</Button>
    <Button type="button" size="sm" variant="outline" onclick={onclose}
      >{m.cancel}</Button
    >
  </div>
</form>
