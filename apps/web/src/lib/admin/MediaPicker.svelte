<script lang="ts" module>
  import type { AdminMedia, MediaVariant } from '@cms/sdk';

  /**
   * What the user chose next to the file: alt text and, for images, a size (none = full size)
   * and, when the picker offers one, a caption.
   */
  export interface MediaChoice {
    alt: string;
    variant?: MediaVariant;
    caption?: string;
  }

  /** One file of a multiple pick with its choice. */
  export interface MediaPick {
    media: AdminMedia;
    choice: MediaChoice;
  }
</script>

<script lang="ts">
  import { thumbnailUrl } from '#lib/admin/media-thumbnail.js';
  import { sizeLabel } from '#lib/admin/image-sizes.js';
  import { deserialize } from '$app/forms';
  import { page as current } from '$app/state';
  import type { MediaKind, Paginated } from '@cms/sdk';
  import { can } from '@cms/sdk/capabilities';
  import type { Capability } from '@cms/sdk/capabilities';
  import { default as Upload } from '@lucide/svelte/icons/upload';
  import { catalogMessage, errorMessage } from '#lib/admin/form-errors.js';
  import type { FormError } from '#lib/admin/form-errors.js';
  import { uploadFile } from '#lib/admin/upload.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  type Props = {
    /** Limits the library to one kind of media (images for the editor and featured image). */
    kind?: MediaKind;
    /** Offers a size choice before inserting (images placed in the body). */
    sizes?: boolean;
    /** Offers a caption for each image before inserting (images placed in the body). */
    captions?: boolean;
  } & (
    | {
        onpick: (media: AdminMedia, choice: MediaChoice) => void;
        onpickmany?: never;
      }
    | {
        /** Lets several files be chosen at once; they arrive in the order they were selected. */
        onpickmany: (picks: MediaPick[]) => void;
        onpick?: never;
      }
  );

  let {
    kind = 'image',
    sizes = false,
    captions = false,
    onpick,
    onpickmany,
  }: Props = $props();
  const multiple = $derived(!!onpickmany);
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
  /**
   * Whether the user may change the library's text of a file or delete it (its uploader, or
   * `media.manage`).
   */
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
  /** A selected file with what the user typed for it. */
  interface Selection {
    media: AdminMedia;
    alt: string;
    size: string;
    caption: string;
    // After a failed library write, the next press uses the alt text here only.
    localOnly: boolean;
  }
  /** In selection order, which is the insertion order; at most one without `multiple`. */
  let selection = $state<Selection[]>([]);
  /** The selected file the details panel shows. */
  let focusedId = $state<string | null>(null);
  const focused = $derived(
    selection.find((entry) => entry.media.id === focusedId),
  );

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

  /** A caption the picked file starts with instead of its library caption (replacing keeps the body's). */
  let presetCaption: string | undefined;

  /** Opens the picker on the newest media. */
  export const open = (preset?: { caption?: string }) => {
    presetCaption = preset?.caption;
    errors = [];
    selection = [];
    focusedId = null;
    dialog.showModal();
    void load(1);
  };

  /** Adds the file to the selection (or replaces it without `multiple`) and shows its details. */
  const select = (media: AdminMedia) => {
    if (!selection.some((entry) => entry.media.id === media.id)) {
      const entry: Selection = {
        media,
        alt: media.alt,
        caption: presetCaption ?? media.caption,
        localOnly: false,
        size: media.variants.some((variant) => variant.name === 'large')
          ? 'large'
          : '',
      };

      selection = multiple ? [...selection, entry] : [entry];
    }

    focusedId = media.id;
  };

  const deselect = (id: string) => {
    selection = selection.filter((entry) => entry.media.id !== id);
    if (focusedId === id) focusedId = selection.at(-1)?.media.id ?? null;
  };

  /** A press on a file: selects it, or in a multiple pick takes the file in focus out again. */
  const toggle = (media: AdminMedia) => {
    if (multiple && focusedId === media.id) deselect(media.id);
    else select(media);
  };

  const form = (fields: Record<string, string>) => {
    const body = new FormData();

    for (const [key, value] of Object.entries(fields)) body.set(key, value);

    return body;
  };

  /**
   * Posts to a form action of the file's page (`?/save`, `?/delete`); resolves to an error
   * message, or null when it succeeded.
   */
  const submit = async (
    media: AdminMedia,
    action: 'save' | 'delete',
    body: FormData,
  ) => {
    const response = await fetch(
      `/admin/media/${encodeURIComponent(media.id)}?/${action}`,
      {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true' },
      },
    ).catch(() => null);

    try {
      const outcome = deserialize(await (response?.text() ?? ''));

      if (outcome.type === 'success') return null;
      // A delete ends on the library; any other redirect is the sign-in page of an expired session.
      if (outcome.type === 'redirect')
        return action === 'delete' &&
          outcome.location.startsWith('/admin/media?')
          ? null
          : m.sessionExpiredTitle;

      return outcome.type === 'failure' && outcome.data
        ? errorMessage(m, i18n.language, outcome.data as FormError)
        : String(response?.status ?? '');
    } catch {
      return String(response?.status ?? m.saveFailed);
    }
  };

  /** The alt text an entry is inserted with: typed for images, the library's otherwise. */
  const altOf = (entry: Selection) =>
    entry.media.kind === 'image' ? entry.alt.trim() : entry.media.alt;

  const pick = async () => {
    if (!selection.length) return;
    const failures: string[] = [];

    busy = true;

    for (const entry of selection) {
      const { media } = entry;
      const text = altOf(entry);

      // Like WordPress, alt text typed here is also kept in the library for the next use.
      if (text === media.alt || !editable(media) || entry.localOnly) continue;
      const failure = await submit(media, 'save', form({ alt: text }));

      if (failure) {
        failures.push(m.mediaAltNotSaved(failure));
        entry.localOnly = true;
        if (failures.length === 1) focusedId = media.id;
      } else media.alt = text;
    }

    busy = false;

    if (failures.length) {
      errors = failures;

      return;
    }

    dialog.close();
    const picks = selection.map((entry): MediaPick => ({
      media: entry.media,
      choice: {
        alt: altOf(entry),
        variant: entry.media.variants.find(
          (variant) => variant.name === entry.size,
        ),
        ...(captions && entry.media.kind === 'image'
          ? { caption: entry.caption.trim() }
          : {}),
      },
    }));

    if (onpickmany) onpickmany(picks);
    else if (picks[0]) onpick?.(picks[0].media, picks[0].choice);
  };

  /** Deletes the file from the library after the user confirms it. */
  const remove = async (media: AdminMedia) => {
    if (!confirm(m.confirmDelete)) return;
    busy = true;
    const failure = await submit(media, 'delete', form({}));

    busy = false;

    if (failure) {
      errors = [m.mediaDeleteFailed(media.filename, failure)];

      return;
    }

    errors = [];

    // A selection can outlive a search reload; only a listed file counts toward the total.
    if (items.some((item) => item.id === media.id)) {
      items = items.filter((item) => item.id !== media.id);
      total--;
    }

    deselect(media.id);
  };

  const upload = async (files: FileList | null | undefined) => {
    // One batch at a time: progress rows belong to the batch that shows them.
    if (!files?.length || uploads.length) return;
    errors = [];
    uploads = [...files].map((file) => ({ name: file.name, progress: 0 }));
    const uploaded: AdminMedia[] = [];

    for (const [index, file] of [...files].entries()) {
      const result = await uploadFile(file, (fraction) => {
        uploads[index]!.progress = fraction;
      });

      // The server decides the kind from the file's bytes, not its name.
      if (!('media' in result))
        errors = [
          ...errors,
          m.mediaUploadFailed(
            file.name,
            catalogMessage(m, result.error, result.params) ?? result.error,
          ),
        ];
      else if (result.media.kind !== kind)
        errors = [...errors, m.mediaWrongKind(file.name)];
      else uploaded.push(result.media);
    }

    uploads = [];
    await load(1);
    // Uploads are selected (only the last without `multiple`), so their alt text can be written
    // before inserting.
    for (const media of multiple ? uploaded : uploaded.slice(-1))
      select(items.find((item) => item.id === media.id) ?? media);
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
  onclick={(event) => {
    // A pick is dismissible: a click on the backdrop (the dialog itself, outside its box) closes it, unless an upload is running.
    if (busy || event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();

    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      dialog.close();
  }}
  oncancel={(event) => {
    if (busy) event.preventDefault();
  }}
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
            {@const thumb = thumbnailUrl(media)}
            {@const order = selection.findIndex(
              (entry) => entry.media.id === media.id,
            )}
            <li class="relative">
              <button
                type="button"
                class="group block w-full overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-primary {multiple &&
                focusedId === media.id
                  ? 'ring-offset-2'
                  : ''}"
                title={media.filename}
                aria-pressed={order >= 0}
                onclick={() => toggle(media)}
                ondblclick={() => {
                  // A double click inserts at once only when one file is picked.
                  if (multiple) return;
                  select(media);
                  void pick();
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
              {#if multiple && order >= 0}
                <!-- The insertion order; the pressed state already tells assistive technology. -->
                <span
                  class="pointer-events-none absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                  aria-hidden="true">{order + 1}</span
                >
              {/if}
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
      {#if multiple && selection.length}
        <p class="text-muted-foreground" aria-live="polite">
          {m.mediaSelectedCount(selection.length)}
        </p>
      {/if}
      {#if focused}
        {@const selected = focused.media}
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
              bind:value={focused.alt}
              onkeydown={(event) => {
                // Enter inserts instead of submitting the form around the picker.
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void pick();
              }}
            />
            <span class="text-xs text-muted-foreground"
              >{editable(selected) ? m.mediaAltHelp : m.mediaAltLocal}</span
            >
          </label>
          {#if captions}
            <label class="grid gap-1">
              {m.contentCaption}
              <Input
                maxlength={2000}
                bind:value={focused.caption}
                onkeydown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void pick();
                }}
              />
            </label>
          {/if}
          {#if sizes}
            <label class="grid gap-1">
              {m.imageSize}
              <NativeSelect class="w-full" bind:value={focused.size}>
                {#each selected.variants as variant (variant.name)}
                  <NativeSelectOption value={variant.name}
                    >{sizeLabel(m, variant.name)} – {variant.width} × {variant.height}</NativeSelectOption
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
        <div class="flex flex-wrap gap-2">
          {#if multiple}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onclick={() => deselect(selected.id)}>{m.mediaDeselect}</Button
            >
          {/if}
          {#if editable(selected)}
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onclick={() => remove(selected)}>{m.deletePermanently}</Button
            >
          {/if}
        </div>
      {/if}
      {#if selection.length}
        <Button class="w-full" disabled={busy} onclick={() => pick()}
          >{sizes ? m.insert : m.mediaSelect}</Button
        >
      {/if}
    </aside>
  </div>
</dialog>
