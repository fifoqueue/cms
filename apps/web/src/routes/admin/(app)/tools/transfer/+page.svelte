<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { IMPORT_AUTHOR_MODES } from '@cms/sdk';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const result = $derived(form && 'result' in form ? form.result : null);
  let busy = $state(false);
</script>

<svelte:head><title>{m.toolsTransfer}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.exportTitle}</CardTitle></CardHeader>
  <CardContent class="grid gap-3 text-sm">
    <p>{m.exportHelp}</p>
    <div>
      <Button href={resolve('/admin/(app)/tools/export')} data-sveltekit-reload
        >{m.exportDownload}</Button
      >
    </div>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.importTitle}</CardTitle></CardHeader>
  <CardContent class="grid gap-3 text-sm">
    <p>{m.importHelp}</p>
    <form
      method="POST"
      action="?/import"
      enctype="multipart/form-data"
      use:enhance={() => {
        busy = true;
        return async ({ update }) => {
          busy = false;
          await update();
        };
      }}
      class="grid gap-3"
    >
      <Input
        type="file"
        name="file"
        accept=".xml,application/xml,text/xml"
        required
        class="w-auto max-w-sm"
      />
      <fieldset class="grid gap-1.5">
        <legend class="font-medium">{m.importAuthors}</legend>
        <p class="text-muted-foreground">{m.importAuthorsHelp}</p>
        {#each IMPORT_AUTHOR_MODES as mode (mode)}
          <label class="flex items-center gap-2">
            <input
              type="radio"
              name="authors"
              value={mode}
              checked={mode === 'me'}
            />
            {m.importAuthorMode(mode)}
          </label>
        {/each}
      </fieldset>
      <div>
        <Button type="submit" disabled={busy}
          >{busy ? m.importRunning : m.importStart}</Button
        >
      </div>
    </form>
    {#if result}
      <p>
        {m.importSummary(
          result.content,
          result.categories + result.tags,
          result.comments,
        )}
      </p>
      <p>{m.importMoreSummary(result.users, result.menus, result.redirects)}</p>
      {#if result.attachments.length}
        <details>
          <summary class="cursor-pointer">
            {m.importAttachments(result.attachments.length)}
          </summary>
          <p class="mt-2 text-muted-foreground">{m.importAttachmentsHelp}</p>
          <ul class="mt-2 list-disc pl-5 break-all">
            {#each result.attachments as file (file.url)}
              <li>
                {file.title || file.url} — {file.url}{#if file.featured}
                  ({m.importFeatured(file.featured)}){/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
      {#if result.skipped.length}
        <details>
          <summary class="cursor-pointer">
            {m.importSkipped(result.skipped.length)}
          </summary>
          <ul class="mt-2 list-disc pl-5">
            {#each result.skipped as item, index (index)}
              <li>{item.title} — {item.reason}</li>
            {/each}
          </ul>
        </details>
      {/if}
    {/if}
  </CardContent>
</Card>
