<script lang="ts">
  import { enhance } from '$app/forms';
  import { CONTENT_STATUSES, CONTENT_TYPES } from '@cms/sdk';
  import type { ContentDocument, ContentEntry, ContentType } from '@cms/sdk';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { untrack } from 'svelte';
  import Editor from './Editor.svelte';

  interface Props {
    entry?: ContentEntry;
    type?: ContentType;
    submitLabel: string;
  }

  let { entry, type = 'post', submitLabel }: Props = $props();

  const EMPTY: ContentDocument = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
  // Initial values only; the form owns the state afterwards.
  const initial = untrack(() => entry);
  let body = $state(initial?.document ?? EMPTY);
</script>

<form
  method="POST"
  action="?/save"
  use:enhance={() =>
    ({ update }) =>
      update({ reset: false })}
  class="space-y-6"
>
  <div class="grid gap-2">
    <Label for="title">Title</Label>
    <Input
      id="title"
      name="title"
      required
      maxlength={255}
      value={initial?.title ?? ''}
    />
  </div>

  <div class="grid gap-4 sm:grid-cols-3">
    <div class="grid gap-2">
      <Label for="slug">Slug</Label>
      <Input
        id="slug"
        name="slug"
        maxlength={191}
        placeholder="generated from title"
        value={initial?.slug ?? ''}
      />
    </div>
    <div class="grid gap-2">
      <Label for="type">Type</Label>
      <NativeSelect id="type" name="type" value={initial?.type ?? type}>
        {#each CONTENT_TYPES as option (option)}
          <NativeSelectOption value={option}>{option}</NativeSelectOption>
        {/each}
      </NativeSelect>
    </div>
    <div class="grid gap-2">
      <Label for="status">Status</Label>
      <NativeSelect
        id="status"
        name="status"
        value={initial?.status ?? 'draft'}
      >
        {#each CONTENT_STATUSES as option (option)}
          <NativeSelectOption value={option}>{option}</NativeSelectOption>
        {/each}
      </NativeSelect>
    </div>
  </div>

  <div class="grid gap-2">
    <Label for="excerpt">Excerpt</Label>
    <Textarea
      id="excerpt"
      name="excerpt"
      maxlength={1000}
      rows={2}
      value={initial?.excerpt ?? ''}
    />
  </div>

  <div class="grid gap-2">
    <Label>Body</Label>
    <Editor name="document" bind:value={body} />
  </div>

  <Button type="submit">{submitLabel}</Button>
</form>
