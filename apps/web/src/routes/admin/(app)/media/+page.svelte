<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { MEDIA_KINDS } from '@cms/sdk';
  import type { MediaKind } from '@cms/sdk';
  import {
    FileText,
    Film,
    LayoutGrid,
    List,
    Music,
    Search,
    Upload,
  } from '@lucide/svelte';
  import ListPager from '#lib/admin/ListPager.svelte';
  import ScreenOptions from '#lib/admin/ScreenOptions.svelte';
  import { listQuery } from '#lib/admin/list-query.js';
  import { thumbnailUrl } from '#lib/admin/media-thumbnail.js';
  import { uploadFile } from '#lib/admin/upload.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { notifyFailure, notifySuccess } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let uploads = $state<{ name: string; progress: number }[]>([]);
  let dragging = $state(false);

  const kindLabel = (m: Messages, kind: MediaKind) =>
    ({
      image: m.mediaImages,
      document: m.mediaDocuments,
      video: m.mediaVideos,
      audio: m.mediaAudio,
    })[kind];
  const query = (changes: Record<string, string | number | undefined>) =>
    listQuery({ ...data.filter, page: data.media.page }, changes);

  let selected = $state<string[]>([]);
  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) {
      cancel();
      return;
    }
    return async ({ result, update }) => {
      selected = [];
      await update();
      if (result.type !== 'success' || !result.data) return;
      const { deleted, kept } = result.data as {
        deleted: number;
        kept: number;
      };
      // Files that entries still show, or other people's, are kept and said so.
      if (deleted)
        notifySuccess(m.mediaDeleted(deleted), {
          description: kept ? m.mediaKept(kept) : undefined,
        });
      else if (kept) notifyFailure(m.mediaKept(kept));
    };
  };
  const date = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language);

  const upload = async (files: FileList | null | undefined) => {
    if (!files?.length || uploads.length) return;
    uploads = [...files].map((file) => ({ name: file.name, progress: 0 }));
    // Each file reports as it finishes.
    for (const [index, file] of [...files].entries()) {
      const result = await uploadFile(file, (fraction) => {
        uploads[index]!.progress = fraction;
      });
      if ('media' in result) notifySuccess(m.mediaUploadedFile(file.name));
      else notifyFailure(m.mediaUploadFailed(file.name, result.error));
      uploads[index]!.progress = 1;
    }
    uploads = [];
    await invalidateAll();
  };
</script>

<svelte:head><title>{m.mediaTitle}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">{m.mediaTitle}</h1>
  <label
    class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground focus-within:ring-2 focus-within:ring-ring"
  >
    <Upload class="size-4" />
    {uploads.length ? m.mediaUploading : m.mediaUpload}
    <input
      type="file"
      multiple
      class="sr-only"
      disabled={uploads.length > 0}
      onchange={(event) => {
        void upload(event.currentTarget.files);
        // Choosing the same file again must still upload it.
        event.currentTarget.value = '';
      }}
    />
  </label>
</div>

<ScreenOptions screen="media" hidden={[]} perPage={data.screen.perPage} />

<div
  role="region"
  aria-label={m.mediaDropHere}
  class="rounded-md border-2 border-dashed p-6 text-center text-sm text-muted-foreground {dragging
    ? 'border-primary bg-muted'
    : ''}"
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={(event) => {
    event.preventDefault();
    dragging = false;
    void upload(event.dataTransfer?.files);
  }}
>
  {m.mediaDropHere}
  {#if uploads.length}
    <ul class="mx-auto mt-3 max-w-md space-y-1 text-left" aria-live="polite">
      {#each uploads as item, index (index)}
        <li class="flex items-center gap-3">
          <span id="upload-{index}" class="min-w-0 flex-1 truncate"
            >{item.name}</span
          >
          <progress
            class="w-32"
            max="1"
            value={item.progress}
            aria-labelledby="upload-{index}"
          ></progress>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<div class="flex flex-wrap items-center gap-2 text-sm">
  <a
    href={resolve(`/admin/(app)/media${query({ kind: undefined, page: 1 })}`)}
    aria-current={!data.filter.kind}
    class="filter">{m.mediaAllKinds}</a
  >
  {#each MEDIA_KINDS as kind (kind)}
    <a
      href={resolve(`/admin/(app)/media${query({ kind, page: 1 })}`)}
      aria-current={data.filter.kind === kind}
      class="filter">{kindLabel(m, kind)}</a
    >
  {/each}
  <span class="ml-auto flex gap-1">
    <a
      href={resolve(`/admin/(app)/media${query({ view: undefined })}`)}
      aria-current={data.filter.view !== 'list'}
      class="filter"
      title={m.mediaGridView}
      ><LayoutGrid class="size-4" /><span class="sr-only"
        >{m.mediaGridView}</span
      ></a
    >
    <a
      href={resolve(`/admin/(app)/media${query({ view: 'list' })}`)}
      aria-current={data.filter.view === 'list'}
      class="filter"
      title={m.mediaListView}
      ><List class="size-4" /><span class="sr-only">{m.mediaListView}</span></a
    >
  </span>
  <form method="GET" role="search" class="flex flex-wrap items-center gap-2">
    {#if data.filter.kind}<input
        type="hidden"
        name="kind"
        value={data.filter.kind}
      />{/if}
    {#if data.filter.view}<input
        type="hidden"
        name="view"
        value={data.filter.view}
      />{/if}
    <Input
      name="month"
      type="month"
      aria-label={m.mediaMonth}
      value={data.filter.month ?? ''}
      class="h-8 w-40"
    />
    <label class="flex items-center gap-1.5">
      <input
        type="checkbox"
        name="unattached"
        value="1"
        checked={!!data.filter.unattached}
      />
      {m.mediaUnattached}
    </label>
    <Input
      name="q"
      type="search"
      placeholder={m.mediaSearch}
      aria-label={m.mediaSearch}
      value={data.filter.q ?? ''}
      class="h-8 w-48"
    />
    <Button type="submit" size="sm" variant="outline"
      ><Search class="size-4" /></Button
    >
  </form>
</div>

{#if data.media.items.length}
  <form
    method="POST"
    action="?/delete"
    use:enhance={confirmDelete}
    class="flex flex-wrap items-center gap-3 text-sm"
  >
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        checked={selected.length === data.media.items.length}
        onchange={(event) =>
          (selected = event.currentTarget.checked
            ? data.media.items.map(({ id }) => id)
            : [])}
      />
      {m.selectAll}
    </label>
    {#each selected as id (id)}<input
        type="hidden"
        name="ids"
        value={id}
      />{/each}
    <Button
      type="submit"
      variant="destructive"
      size="sm"
      disabled={!selected.length}>{m.deletePermanently}</Button
    >
  </form>
  {#if data.filter.view === 'list'}
    <div class="overflow-x-auto rounded-md border bg-background">
      <table class="w-full text-sm">
        <thead class="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" class="w-8 p-2"
              ><span class="sr-only">{m.selectAll}</span></th
            >
            <th scope="col" class="p-2">{m.mediaFile}</th>
            <th scope="col" class="p-2">{m.fieldAuthor}</th>
            <th scope="col" class="p-2">{m.mediaUsedColumn}</th>
            <th scope="col" class="p-2">{m.mediaUploadedOn}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.media.items as media (media.id)}
            {@const thumb = thumbnailUrl(media)}
            <tr class="border-b last:border-0">
              <td class="p-2"
                ><input
                  type="checkbox"
                  value={media.id}
                  bind:group={selected}
                  aria-label={m.selectItem(media.filename)}
                /></td
              >
              <td class="p-2">
                <a
                  href={resolve('/admin/(app)/media/[id]', { id: media.id })}
                  class="flex items-center gap-3 hover:underline"
                >
                  {#if media.kind === 'image'}<img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      class="size-10 rounded object-cover"
                    />{:else}<FileText
                      class="size-10 p-2 text-muted-foreground"
                    />{/if}
                  <span class="break-all">{media.filename}</span>
                </a>
              </td>
              <td class="p-2">{media.uploaderName || m.none}</td>
              <td class="p-2"
                >{media.usageCount
                  ? m.mediaUsed(media.usageCount)
                  : m.mediaUnattached}</td
              >
              <td class="p-2 whitespace-nowrap">{date(media.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {#each data.media.items as media (media.id)}
        {@const thumb = thumbnailUrl(media)}
        <li class="relative">
          <input
            type="checkbox"
            value={media.id}
            bind:group={selected}
            aria-label={m.selectItem(media.filename)}
            class="absolute top-2 left-2 z-10 size-4"
          />
          <a
            href={resolve('/admin/(app)/media/[id]', { id: media.id })}
            class="block overflow-hidden rounded-md border bg-background hover:opacity-80"
            title={media.filename}
          >
            {#if media.kind === 'image'}
              <img
                src={thumb}
                alt={media.alt || media.filename}
                loading="lazy"
                class="aspect-square w-full object-cover"
              />
            {:else}
              <span
                class="flex aspect-square flex-col items-center justify-center gap-2 p-2 text-center text-xs break-all text-muted-foreground"
              >
                {#if media.kind === 'video'}<Film
                    class="size-8"
                  />{:else if media.kind === 'audio'}<Music
                    class="size-8"
                  />{:else}<FileText class="size-8" />{/if}
                {media.filename}
              </span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
{:else}
  <p class="text-sm text-muted-foreground">{m.mediaEmpty}</p>
{/if}

<ListPager route="/admin/(app)/media" list={data.media} {query} />

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
