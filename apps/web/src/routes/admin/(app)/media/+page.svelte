<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { MEDIA_KINDS } from '@cms/sdk';
  import type { MediaKind } from '@cms/sdk';
  import { FileText, Film, Music, Search, Upload } from '@lucide/svelte';
  import { uploadFile } from '#lib/admin/upload.js';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let notice = $state('');
  let errors = $state<string[]>([]);
  let uploads = $state<{ name: string; progress: number }[]>([]);
  let dragging = $state(false);

  const kindLabel = (m: Messages, kind: MediaKind) =>
    ({
      image: m.mediaImages,
      document: m.mediaDocuments,
      video: m.mediaVideos,
      audio: m.mediaAudio,
    })[kind];
  const lastPage = $derived(
    Math.max(1, Math.ceil(data.media.total / data.media.pageSize)),
  );
  const query = (changes: Record<string, string | number | undefined>) => {
    const params = new SvelteURLSearchParams();
    for (const [key, value] of Object.entries({
      ...data.filter,
      page: data.media.page,
      ...changes,
    }))
      if (value !== undefined) params.set(key, String(value));
    return `?${params}` as const;
  };

  const upload = async (files: FileList | null | undefined) => {
    if (!files?.length || uploads.length) return;
    errors = [];
    notice = '';
    uploads = [...files].map((file) => ({ name: file.name, progress: 0 }));
    let done = 0;
    for (const [index, file] of [...files].entries()) {
      const result = await uploadFile(file, (fraction) => {
        uploads[index]!.progress = fraction;
      });
      if ('media' in result) done++;
      else errors = [...errors, m.mediaUploadFailed(file.name, result.error)];
      uploads[index]!.progress = 1;
    }
    uploads = [];
    notice = done ? m.mediaUploaded(done) : '';
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

{#if notice}<Alert><AlertTitle>{notice}</AlertTitle></Alert>{/if}
{#if errors.length}
  <Alert variant="destructive">
    <AlertTitle>
      <ul>
        {#each errors as error (error)}<li>{error}</li>{/each}
      </ul>
    </AlertTitle>
  </Alert>
{/if}

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
  <form method="GET" role="search" class="ml-auto flex gap-2">
    {#if data.filter.kind}<input
        type="hidden"
        name="kind"
        value={data.filter.kind}
      />{/if}
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
  <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
    {#each data.media.items as media (media.id)}
      {@const thumb =
        media.variants.find((variant) => variant.name === 'thumbnail')?.url ??
        media.url}
      <li>
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
{:else}
  <p class="text-sm text-muted-foreground">{m.mediaEmpty}</p>
{/if}

{#if lastPage > 1}
  <div class="flex justify-between text-sm">
    {#if data.media.page > 1}<a
        href={resolve(
          `/admin/(app)/media${query({ page: data.media.page - 1 })}`,
        )}>{m.previous}</a
      >{:else}<span></span>{/if}
    <span class="text-muted-foreground"
      >{m.pageOf(data.media.page, lastPage)}</span
    >
    {#if data.media.page < lastPage}<a
        href={resolve(
          `/admin/(app)/media${query({ page: data.media.page + 1 })}`,
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
