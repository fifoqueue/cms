<script lang="ts">
  import type { AdminMedia, MediaKind, Paginated } from '@cms/sdk';
  import { Upload } from '@lucide/svelte';
  import { uploadFile } from '#lib/admin/upload.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    /** Limits the library to one kind of media (images for the editor and featured image). */
    kind?: MediaKind;
    onpick: (media: AdminMedia) => void;
  }

  let { kind = 'image', onpick }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  let dialog: HTMLDialogElement;
  let items = $state<AdminMedia[]>([]);
  let page = $state(1);
  let total = $state(0);
  let search = $state('');
  let busy = $state(false);
  let errors = $state<string[]>([]);

  const load = async (next: number) => {
    busy = true;
    const query = `kind=${kind}&page=${next}${
      search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
    }`;
    const response = await fetch(`/admin/media/picker?${query}`).catch(
      () => null,
    );
    busy = false;
    if (!response?.ok) return;
    const result = (await response.json()) as Paginated<AdminMedia>;
    items = next === 1 ? result.items : [...items, ...result.items];
    page = next;
    total = result.total;
  };

  /** Opens the picker on the newest media. */
  export const open = () => {
    errors = [];
    dialog.showModal();
    void load(1);
  };

  const pick = (media: AdminMedia) => {
    dialog.close();
    onpick(media);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    busy = true;
    errors = [];
    let last: AdminMedia | null = null;
    for (const file of files) {
      const result = await uploadFile(file);
      if ('media' in result) last = result.media;
      else errors = [...errors, m.mediaUploadFailed(file.name, result.error)];
    }
    busy = false;
    // A single successful upload is picked at once, like choosing it from the grid.
    if (last && files.length === 1) pick(last);
    else void load(1);
  };
</script>

<dialog
  bind:this={dialog}
  class="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-lg border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/40"
  aria-label={m.mediaChoose}
>
  <div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
    <h2 class="text-lg font-semibold">{m.mediaChoose}</h2>
    <div class="flex flex-wrap items-center gap-2">
      <!-- Not a <form>: the picker is used inside other forms, and forms cannot nest. -->
      <div role="search">
        <Input
          type="search"
          placeholder={m.mediaSearch}
          aria-label={m.mediaSearch}
          bind:value={search}
          class="h-8 w-48"
          onkeydown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void load(1);
          }}
        />
      </div>
      <label
        class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground"
      >
        <Upload class="size-4" />
        {busy ? m.mediaUploading : m.mediaUpload}
        <input
          type="file"
          multiple
          accept={kind === 'image' ? 'image/*' : undefined}
          class="sr-only"
          onchange={(event) => upload(event.currentTarget.files)}
        />
      </label>
      <Button variant="ghost" size="sm" onclick={() => dialog.close()}
        >{m.close}</Button
      >
    </div>
  </div>
  {#if errors.length}
    <ul
      class="space-y-1 border-b bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      {#each errors as error (error)}<li>{error}</li>{/each}
    </ul>
  {/if}
  <div class="max-h-[60vh] overflow-y-auto p-4">
    {#if items.length}
      <ul class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {#each items as media (media.id)}
          {@const thumb =
            media.variants.find((variant) => variant.name === 'thumbnail')
              ?.url ?? media.url}
          <li>
            <button
              type="button"
              class="group block w-full overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:ring-ring"
              title={media.filename}
              onclick={() => pick(media)}
            >
              {#if media.kind === 'image'}
                <img
                  src={thumb}
                  alt={media.alt || media.filename}
                  loading="lazy"
                  class="aspect-square w-full object-cover group-hover:opacity-80"
                />
              {:else}
                <span
                  class="flex aspect-square items-center justify-center p-2 text-xs break-all"
                  >{media.filename}</span
                >
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if items.length < total}
        <div class="mt-4 text-center">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onclick={() => load(page + 1)}>{m.loadMore}</Button
          >
        </div>
      {/if}
    {:else if !busy}
      <p class="text-sm text-muted-foreground">{m.mediaEmpty}</p>
    {/if}
  </div>
</dialog>
