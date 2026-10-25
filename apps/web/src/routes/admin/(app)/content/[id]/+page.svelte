<script lang="ts">
  import type { Path } from '$app/types';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { default as ExternalLink } from '@lucide/svelte/icons/external-link';
  import { default as RotateCcw } from '@lucide/svelte/icons/rotate-ccw';
  import { default as Trash2 } from '@lucide/svelte/icons/trash-2';
  import ClientOrigin from '#lib/admin/ClientOrigin.svelte';
  import ContentForm from '#lib/admin/ContentForm.svelte';
  import { onMount } from 'svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { forgetParams, notifySuccess } from '#lib/feedback.js';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { typeLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };
  let restored = $state(0);
  const restoreRevision: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.revisionRestoreConfirm)) {
      cancel();
      return;
    }
    return async ({ result, update }) => {
      await update();
      if (result.type === 'success') restored++;
    };
  };
  const date = (value: string) => new Date(value).toLocaleString(i18n.language);

  // The revisions screen restores a version and comes back with `?restored`.
  onMount(() => {
    if (!page.url.searchParams.has('restored')) return;
    notifySuccess(m.revisionRestored);
    forgetParams('restored');
  });
</script>

<svelte:head><title>{data.entry.title}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">
    {m.contentEditTitle(typeLabel(m, data.entry.type))}
  </h1>
  <div class="flex flex-wrap gap-2">
    {#if data.entry.status === 'published' && !data.entry.trashedAt}
      <Button
        href={resolve(data.entry.path as Path)}
        variant="outline"
        target="_blank"><ExternalLink class="size-4" /> {m.view}</Button
      >
    {/if}
    {#if data.entry.trashedAt}
      <form method="POST" action="?/restore" use:enhance>
        <Button type="submit" variant="outline"
          ><RotateCcw class="size-4" /> {m.restore}</Button
        >
      </form>
    {:else}
      <form method="POST" action="?/trash" use:enhance>
        <Button type="submit" variant="destructive"
          ><Trash2 class="size-4" /> {m.moveToTrash}</Button
        >
      </form>
    {/if}
    <form method="POST" action="?/delete" use:enhance={confirmDelete}>
      <Button type="submit" variant="destructive"
        ><Trash2 class="size-4" /> {m.deletePermanently}</Button
      >
    </form>
  </div>
</div>

<!-- A refused save (it echoes the `values`) shows in the editor, by its save button. -->
<FormMessage form={form && 'values' in form ? null : form} />

{#if data.autosave && !data.useAutosave}
  <Alert>
    <AlertTitle class="flex flex-wrap items-center justify-between gap-2">
      {m.autosaveNewer}
      <a
        class="underline"
        href={resolve(`/admin/(app)/content/[id]?autosave`, {
          id: data.entry.id,
        })}
        data-sveltekit-reload>{m.autosaveLoad}</a
      >
    </AlertTitle>
  </Alert>
{/if}

<!-- Saving keeps the editor (cursor, open panels); restoring a revision reloads its text. -->
{#key `${data.user.id}:${data.entry.id}:${data.useAutosave}:${restored}`}
  <ContentForm
    entry={data.entry}
    userId={data.user.id}
    revisionCount={data.revisions.filter(
      (revision) => revision.kind === 'revision',
    ).length}
    fieldImages={data.fieldImages}
    canManageTerms={data.canManageTerms}
    created={(page.shallow?.url ?? page.url).searchParams.get('saved')}
    previewTab={(page.shallow?.url ?? page.url).searchParams.get('preview')}
    values={form && 'values' in form ? form.values : undefined}
    draft={data.useAutosave && data.autosave ? data.autosave : undefined}
    parentPages={data.parentPages}
    extraTaxonomies={data.extraTaxonomies}
    categories={data.categories}
    tags={data.tags}
    seo={data.seo}
    model={data.model}
    authors={data.authors}
    canPublish={data.canPublish}
    pushKey={data.pushKey}
  />
{/key}

<Card>
  <CardHeader><CardTitle>{m.revisionsTitle}</CardTitle></CardHeader>
  <CardContent>
    {#if data.revisions.length}
      <ul class="divide-y rounded-md border">
        {#each data.revisions as revision (revision.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 p-3">
            <div class="min-w-0 text-sm">
              <p class="font-medium">
                {revision.title}
                {#if revision.kind === 'autosave'}<Badge
                    variant="outline"
                    class="ml-1">{m.revisionAutosave}</Badge
                  >{:else if revision.isCurrent}<Badge
                    variant="secondary"
                    class="ml-1">{m.revisionCurrent}</Badge
                  >{/if}
              </p>
              <p class="text-muted-foreground">
                {revision.authorName} · {date(revision.createdAt)}
              </p>
              <ClientOrigin
                brief
                ip={revision.ip}
                userAgent={revision.userAgent}
              />
            </div>
            <div class="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                href={`${resolve('/admin/(app)/content/[id]/revisions', {
                  id: data.entry.id,
                })}?to=${encodeURIComponent(revision.id)}`}
                >{m.revisionCompare}</Button
              >
              {#if !revision.isCurrent}
                <form
                  method="POST"
                  action="?/restoreRevision"
                  use:enhance={restoreRevision}
                >
                  <input type="hidden" name="revisionId" value={revision.id} />
                  <Button type="submit" variant="outline" size="sm"
                    >{m.restore}</Button
                  >
                </form>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground">{m.revisionsEmpty}</p>
    {/if}
  </CardContent>
</Card>
