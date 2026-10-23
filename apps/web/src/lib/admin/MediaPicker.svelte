<script lang="ts" module>
  import type { MediaVariant } from '@cms/sdk';

  /** What the user chose next to the file: alt text and, for images, a size (none = full size). */
  export interface MediaChoice {
    alt: string;
    variant?: MediaVariant;
  }
</script>

<script lang="ts">
  import { deserialize } from '$app/forms';
  import { page as current } from '$app/state';
  import type { AdminMedia, MediaKind, Paginated } from '@cms/sdk';
  import { can } from '@cms/sdk/capabilities';
  import type { Capability } from '@cms/sdk/capabilities';
  import { Upload } from '@lucide/svelte';
  import { uploadFile } from '#lib/admin/upload.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    /** Limits the library to one kind of media (images for the editor and featured image). */
    kind?: MediaKind;
    /** Offers a size choice before inserting (images placed in the body). */
    sizes?: boolean;
    onpick: (media: AdminMedia, choice: MediaChoice) => void;
  }

  let { kind = 'image', sizes = false, onpick }: Props = $props();
  // Several pickers share a page; their element ids must not collide.
  const uid = $props.id();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  // The admin layout provides the signed-in user; the API checks the permission again.
  const user = $derived(
    current.data.user as
      | { id: string; role: string; capabilities?: readonly Capability[] }
      | undefined,
  );
  /** Whether the user may change the library's text of a file (its uploader, or `media.manage`). */
  const editable = (media: AdminMedia) =>
    !!user && (media.uploaderId === user.id || can(user, 'media.manage'));

  let dialog: HTMLDialogElement;
  let items = $state<AdminMedia[]>([]);
  let page = $state(1);
  let total = $state(0);
  let search = $state('');
  let busy = $state(false);
  let errors = $state<string[]>([]);
  let uploads = $state<{ name: string; progress: number }[]>([]);
  let dragging = $state(false);
  let selected = $state<AdminMedia | null>(null);
  let alt = $state('');
  let size = $state('');
  // After a failed library write, the next press uses the alt text here only.
  let localOnly = $state(false);

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
    selected = null;
    dialog.showModal();
    void load(1);
  };

  const select = (media: AdminMedia) => {
    selected = media;
    alt = media.alt;
    localOnly = false;
    size = media.variants.some((variant) => variant.name === 'large')
      ? 'large'
      : '';
  };

  /** Saves the alt text to the library; resolves to an error message, or null when saved. */
  const saveAlt = async (media: AdminMedia, text: string) => {
    const body = new FormData();
    body.set('alt', text);
    const response = await fetch(
      `/admin/media/${encodeURIComponent(media.id)}?/save`,
      {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true' },
      },
    ).catch(() => null);
    try {
      const outcome = deserialize(await (response?.text() ?? ''));
      if (outcome.type === 'success') return null;
      if (outcome.type === 'redirect') return m.sessionExpiredTitle;
      const message =
        outcome.type === 'failure' ? outcome.data?.message : undefined;
      return typeof message === 'string'
        ? message
        : String(response?.status ?? '');
    } catch {
      return String(response?.status ?? m.saveFailed);
    }
  };

  const pick = async (media: AdminMedia) => {
    const text = media.kind === 'image' ? alt.trim() : media.alt;
    // Like WordPress, alt text typed here is also kept in the library for the next use.
    if (text !== media.alt && editable(media) && !localOnly) {
      busy = true;
      const failure = await saveAlt(media, text);
      busy = false;
      if (failure) {
        errors = [m.mediaAltNotSaved(failure)];
        localOnly = true;
        return;
      }
      media.alt = text;
    }
    dialog.close();
    onpick(media, {
      alt: text,
      variant: media.variants.find((variant) => variant.name === size),
    });
  };

  const upload = async (files: FileList | null | undefined) => {
    // One batch at a time: progress rows belong to the batch that shows them.
    if (!files?.length || uploads.length) return;
    errors = [];
    uploads = [...files].map((file) => ({ name: file.name, progress: 0 }));
    let last: AdminMedia | null = null;
    for (const [index, file] of [...files].entries()) {
      const result = await uploadFile(file, (fraction) => {
        uploads[index]!.progress = fraction;
      });
      // The server decides the kind from the file's bytes, not its name.
      if (!('media' in result))
        errors = [...errors, m.mediaUploadFailed(file.name, result.error)];
      else if (result.media.kind !== kind)
        errors = [...errors, m.mediaWrongKind(file.name)];
      else last = result.media;
    }
    uploads = [];
    await load(1);
    // The last upload is selected, so its alt text can be written before inserting.
    if (last) select(last);
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    dragging = false;
    void upload(event.dataTransfer?.files);
  };
</script>

<dialog
  bind:this={dialog}
  class="m-auto w-[min(64rem,calc(100vw-2rem))] rounded-lg border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/40"
  aria-label={m.mediaChoose}
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={(event) => {
    if (event.target === event.currentTarget) dragging = false;
  }}
  ondrop={drop}
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
        class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground focus-within:ring-2 focus-within:ring-ring"
      >
        <Upload class="size-4" />
        {uploads.length ? m.mediaUploading : m.mediaUpload}
        <input
          type="file"
          multiple
          accept={kind === 'image'
            ? 'image/*'
            : kind === 'audio'
              ? 'audio/*'
              : undefined}
          class="sr-only"
          disabled={uploads.length > 0}
          onchange={(event) => {
            void upload(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
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
  {#if uploads.length}
    <ul class="space-y-1 border-b p-3 text-sm" aria-live="polite">
      {#each uploads as upload, index (index)}
        <li class="flex items-center gap-3">
          <span id="{uid}-upload-{index}" class="min-w-0 flex-1 truncate"
            >{upload.name}</span
          >
          <progress
            class="w-32"
            max="1"
            value={upload.progress}
            aria-labelledby="{uid}-upload-{index}"
          ></progress>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="grid md:grid-cols-[minmax(0,1fr)_16rem]">
    <div
      class="max-h-[60vh] overflow-y-auto p-4 {dragging
        ? 'outline-2 -outline-offset-4 outline-primary outline-dashed'
        : ''}"
    >
      <p class="mb-3 text-xs text-muted-foreground">{m.mediaDropHere}</p>
      {#if items.length}
        <ul class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {#each items as media (media.id)}
            {@const thumb =
              media.variants.find((variant) => variant.name === 'thumbnail')
                ?.url ?? media.url}
            <li>
              <button
                type="button"
                class="group block w-full overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-primary"
                title={media.filename}
                aria-pressed={selected?.id === media.id}
                onclick={() => select(media)}
                ondblclick={() => {
                  select(media);
                  void pick(media);
                }}
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
    <aside
      class="space-y-3 border-t p-4 text-sm md:border-t-0 md:border-l"
      aria-label={m.mediaDetails}
    >
      {#if selected}
        <h3 class="font-medium">{m.mediaDetails}</h3>
        <p class="break-all">{selected.filename}</p>
        {#if selected.width && selected.height}
          <p class="text-muted-foreground">
            {selected.width} × {selected.height}
          </p>
        {/if}
        {#if selected.kind === 'image'}
          <!-- Without library rights the alt text can only be used in the body. -->
          <label class="grid gap-1" hidden={!editable(selected) && !sizes}>
            {m.mediaAlt}
            <Input
              maxlength={500}
              bind:value={alt}
              onkeydown={(event) => {
                // Enter inserts instead of submitting the form around the picker.
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (selected) void pick(selected);
              }}
            />
            <span class="text-xs text-muted-foreground"
              >{editable(selected) ? m.mediaAltHelp : m.mediaAltLocal}</span
            >
          </label>
          {#if sizes}
            <label class="grid gap-1">
              {m.imageSize}
              <NativeSelect class="w-full" bind:value={size}>
                {#each selected.variants as variant (variant.name)}
                  <NativeSelectOption value={variant.name}
                    >{{
                      thumbnail: m.sizeThumbnail,
                      medium: m.sizeMedium,
                      large: m.sizeLarge,
                    }[variant.name]} – {variant.width} × {variant.height}</NativeSelectOption
                  >
                {/each}
                <NativeSelectOption value=""
                  >{m.sizeFull}{selected.width
                    ? ` – ${selected.width} × ${selected.height}`
                    : ''}</NativeSelectOption
                >
              </NativeSelect>
            </label>
          {/if}
        {/if}
        <Button
          class="w-full"
          disabled={busy}
          onclick={() => selected && void pick(selected)}
          >{sizes ? m.insert : m.mediaSelect}</Button
        >
      {/if}
    </aside>
  </div>
</dialog>
