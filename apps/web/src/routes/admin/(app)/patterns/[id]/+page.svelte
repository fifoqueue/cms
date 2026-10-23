<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { ContentDocument } from '@cms/sdk';
  import Editor from '#lib/admin/Editor.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { confirmLeave } from '#lib/admin/unsaved.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { statusLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  // svelte-ignore state_referenced_locally
  let body = $state<ContentDocument>(
    data.pattern?.document ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  );
  // svelte-ignore state_referenced_locally
  let title = $state(data.pattern?.title ?? '');
  // svelte-ignore state_referenced_locally
  let saved = $state(JSON.stringify([title, body]));
  let edited = $state(false);
  confirmLeave(
    () => edited || JSON.stringify([title, body]) !== saved,
    () => m.unsavedLeave,
  );
</script>

<svelte:head><title>{data.pattern?.title ?? m.patternAdd}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">
    {data.pattern ? m.patternEdit : m.patternAdd}
  </h1>
  <Button variant="outline" href={resolve('/admin/(app)/patterns')}
    >{m.patternsTitle}</Button
  >
</div>
<FormMessage {form} />

<form
  method="POST"
  action="?/save"
  use:enhance={() => {
    const sent = JSON.stringify([title, body]);
    return async ({ result, update }) => {
      if (result.type === 'success' || result.type === 'redirect') {
        saved = sent;
        edited = false;
      }
      await update({ reset: false });
    };
  }}
  onchange={() => (edited = true)}
  class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]"
>
  <div class="min-w-0 space-y-4">
    <div class="grid gap-2">
      <Label for="title">{m.fieldTitle}</Label>
      <Input
        id="title"
        name="title"
        required
        maxlength={191}
        bind:value={title}
      />
    </div>
    <div class="grid gap-2">
      <Label>{m.fieldBody}</Label>
      <Editor name="document" label={m.fieldBody} bind:value={body} />
    </div>
  </div>
  <aside class="space-y-4">
    <label class="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name="synced"
        checked={data.pattern?.synced ?? true}
        class="mt-0.5"
      />
      {m.patternSynced}
    </label>
    <div class="grid gap-2">
      <Label for="status">{m.fieldStatus}</Label>
      <NativeSelect
        id="status"
        name="status"
        class="w-full"
        value={data.pattern?.status ??
          (data.canPublish ? 'published' : 'draft')}
      >
        {#if data.canPublish}<NativeSelectOption value="published"
            >{statusLabel(m, 'published')}</NativeSelectOption
          >{/if}
        <NativeSelectOption value="draft"
          >{statusLabel(m, 'draft')}</NativeSelectOption
        >
      </NativeSelect>
      <p class="text-xs text-muted-foreground">{m.patternDraftHelp}</p>
    </div>
    <Button type="submit" class="w-full">{m.save}</Button>
  </aside>
</form>
