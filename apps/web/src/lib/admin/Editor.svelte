<script lang="ts">
  import { Editor } from '@tiptap/core';
  import type { ChainedCommands } from '@tiptap/core';
  import type { EditorView } from '@tiptap/pm/view';
  import { contentExtensions } from '@cms/content';
  import { IMAGE_SIZES } from '@cms/sdk';
  import type { AdminMedia, ContentDocument } from '@cms/sdk';
  import {
    Bold,
    Code,
    Heading2,
    Heading3,
    Image,
    Music,
    Italic,
    Link,
    List,
    ListOrdered,
    Quote,
    Redo,
    SquareCode,
    Strikethrough,
    Table,
    Undo,
    SquarePlay,
  } from '@lucide/svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import type { MediaChoice } from '#lib/admin/MediaPicker.svelte';
  import { uploadFile } from '#lib/admin/upload.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';

  interface Props {
    /** Form field that receives the document as JSON. */
    name: string;
    value: ContentDocument;
    /** Accessible name of the writing area (the visible field label). */
    label: string;
  }

  let { name, value = $bindable(), label }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let audioPicker: ReturnType<typeof MediaPicker>;
  let picker: ReturnType<typeof MediaPicker>;
  let embedDialog: HTMLDialogElement;
  let embedUrl = $state('');
  let linkDialog: HTMLDialogElement;
  let linkUrl = $state('');
  let uploading = $state(0);
  let uploadErrors = $state<string[]>([]);

  let element: HTMLDivElement;
  let editor = $state.raw<Editor | null>(null);
  // Bumped on every transaction so toolbar state re-renders.
  let revision = $state(0);

  /** Image node attributes for a library file at the chosen size. */
  const imageNode = (media: AdminMedia, choice: MediaChoice) => ({
    type: 'image',
    attrs: {
      src: choice.variant?.url ?? media.url,
      alt: choice.alt,
      mediaId: media.id,
      width: choice.variant?.width ?? media.width,
      height: choice.variant?.height ?? media.height,
    },
  });

  const isImage = (file: File) => file.type.startsWith('image/');
  /** Where pending uploads go; every transaction maps them, so edits meanwhile keep them in place. */
  let markers: { pos: number }[] = [];

  /** Uploads dropped or pasted image files and inserts them at `position`. */
  const uploadInto = (view: EditorView, files: File[], position: number) => {
    const images = files.filter(isImage);
    if (!images.length) return false;
    const marker = { pos: position };
    markers.push(marker);
    void (async () => {
      uploadErrors = [];
      uploading += images.length;
      for (const file of images) {
        const result = await uploadFile(file);
        uploading--;
        // The server decides the kind from the file's bytes, not the browser's type.
        if (!('media' in result) || result.media.kind !== 'image') {
          uploadErrors = [
            ...uploadErrors,
            'media' in result
              ? m.mediaWrongKind(file.name)
              : m.mediaUploadFailed(file.name, result.error),
          ];
          continue;
        }
        const media = result.media;
        if (!editor || view.isDestroyed) break;
        // Mapping moves the marker past each inserted image, so the next one follows it.
        editor
          .chain()
          .insertContentAt(
            marker.pos,
            imageNode(media, {
              alt: media.alt,
              variant: media.variants.find(
                (variant) => variant.name === 'large',
              ),
            }),
          )
          .run();
      }
      markers = markers.filter((other) => other !== marker);
    })();
    return true;
  };

  onMount(() => {
    const instance = new Editor({
      element,
      extensions: contentExtensions,
      content: value,
      editorProps: {
        attributes: {
          class:
            'prose max-w-none min-h-80 px-4 py-3 focus:outline-none dark:prose-invert',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': label,
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved || !event.dataTransfer?.files.length) return false;
          const position = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;
          if (position === undefined) return false;
          if (!uploadInto(view, [...event.dataTransfer.files], position))
            return false;
          event.preventDefault();
          return true;
        },
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.some(isImage)) return false;
          // Pasting replaces the selection, as it does for text.
          view.dispatch(view.state.tr.deleteSelection());
          return uploadInto(view, files, view.state.selection.from);
        },
      },
      onTransaction: ({ transaction }) => {
        revision++;
        for (const marker of markers)
          marker.pos = transaction.mapping.map(marker.pos);
      },
      onUpdate: ({ editor: current }) =>
        (value = current.getJSON() as ContentDocument),
    });
    editor = instance;
    return () => instance.destroy();
  });

  const run = (command: (chain: ChainedCommands) => ChainedCommands) => {
    if (editor) command(editor.chain().focus()).run();
  };

  const isActive = (type: string, attributes?: Record<string, unknown>) =>
    revision >= 0 && (editor?.isActive(type, attributes) ?? false);

  const editLink = () => {
    linkUrl = (editor?.getAttributes('link').href as string | undefined) ?? '';
    linkDialog.showModal();
  };

  const applyLink = (href: string) => {
    linkDialog.close();
    run((chain) =>
      href
        ? chain.extendMarkRange('link').setLink({ href })
        : chain.extendMarkRange('link').unsetLink(),
    );
  };

  /** Inserts a library image; the media id keeps usage tracking accurate. */
  const insertImage = (media: AdminMedia, choice: MediaChoice) =>
    run((chain) => chain.insertContent(imageNode(media, choice)));

  const insertEmbed = () => {
    const url = embedUrl.trim();
    embedDialog.close();
    embedUrl = '';
    if (/^https:\/\//.test(url))
      run((chain) => chain.insertContent({ type: 'embed', attrs: { url } }));
  };

  const inTable = $derived(
    revision >= 0 && (editor?.isActive('table') ?? false),
  );

  /** Attributes of the selected image, when an image is selected. */
  const image = $derived(
    revision >= 0 && editor?.isActive('image')
      ? editor.getAttributes('image')
      : null,
  );

  /** Updates the selected image without moving focus out of the settings field. */
  const setImage = (attributes: Record<string, unknown>) =>
    editor?.chain().updateAttributes('image', attributes).run();

  /** Size of the selected image's file, read from the loaded picture. */
  const natural = () => {
    if (!editor) return null;
    const node = editor.view.nodeDOM(editor.state.selection.from);
    const picture =
      node instanceof HTMLImageElement
        ? node
        : node instanceof HTMLElement
          ? node.querySelector('img')
          : null;
    return picture?.naturalWidth
      ? { width: picture.naturalWidth, height: picture.naturalHeight }
      : null;
  };

  const imageSize = $derived(
    image?.width === IMAGE_SIZES.thumbnail
      ? 'thumbnail'
      : image?.width === IMAGE_SIZES.medium
        ? 'medium'
        : '',
  );

  const resize = (size: string) => {
    const full = natural();
    if (!full) return;
    const width =
      size === 'thumbnail' || size === 'medium'
        ? Math.min(IMAGE_SIZES[size], full.width)
        : full.width;
    setImage({
      width,
      height: Math.round((width * full.height) / full.width),
    });
  };

  // One tab stop for the whole toolbar; arrow keys, Home and End move between buttons.
  let focused = $state(0);
  const moveFocus = (event: KeyboardEvent) => {
    const buttons = [
      ...(event.currentTarget as HTMLElement).querySelectorAll('button'),
    ];
    const last = buttons.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? focused === last
          ? 0
          : focused + 1
        : event.key === 'ArrowLeft'
          ? focused === 0
            ? last
            : focused - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    focused = next;
    buttons[next]?.focus();
  };

  interface Tool {
    label: string;
    icon: Component;
    active?: () => boolean;
    action: () => void;
  }

  const tools: Tool[] = $derived([
    {
      label: m.editorBold,
      icon: Bold,
      active: () => isActive('bold'),
      action: () => run((c) => c.toggleBold()),
    },
    {
      label: m.editorItalic,
      icon: Italic,
      active: () => isActive('italic'),
      action: () => run((c) => c.toggleItalic()),
    },
    {
      label: m.editorStrike,
      icon: Strikethrough,
      active: () => isActive('strike'),
      action: () => run((c) => c.toggleStrike()),
    },
    {
      label: m.editorCode,
      icon: Code,
      active: () => isActive('code'),
      action: () => run((c) => c.toggleCode()),
    },
    {
      label: m.editorLink,
      icon: Link,
      active: () => isActive('link'),
      action: editLink,
    },
    {
      label: m.editorHeading(2),
      icon: Heading2,
      active: () => isActive('heading', { level: 2 }),
      action: () => run((c) => c.toggleHeading({ level: 2 })),
    },
    {
      label: m.editorHeading(3),
      icon: Heading3,
      active: () => isActive('heading', { level: 3 }),
      action: () => run((c) => c.toggleHeading({ level: 3 })),
    },
    {
      label: m.editorBulletList,
      icon: List,
      active: () => isActive('bulletList'),
      action: () => run((c) => c.toggleBulletList()),
    },
    {
      label: m.editorOrderedList,
      icon: ListOrdered,
      active: () => isActive('orderedList'),
      action: () => run((c) => c.toggleOrderedList()),
    },
    {
      label: m.editorQuote,
      icon: Quote,
      active: () => isActive('blockquote'),
      action: () => run((c) => c.toggleBlockquote()),
    },
    {
      label: m.editorCodeBlock,
      icon: SquareCode,
      active: () => isActive('codeBlock'),
      action: () => run((c) => c.toggleCodeBlock()),
    },
    { label: m.editorImage, icon: Image, action: () => picker.open() },
    { label: m.mediaAudio, icon: Music, action: () => audioPicker.open() },
    {
      label: m.editorTable,
      icon: Table,
      active: () => isActive('table'),
      action: () =>
        run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
    },
    {
      label: m.insertEmbed,
      icon: SquarePlay,
      action: () => embedDialog.showModal(),
    },
    { label: m.editorUndo, icon: Undo, action: () => run((c) => c.undo()) },
    { label: m.editorRedo, icon: Redo, action: () => run((c) => c.redo()) },
  ]);
</script>

<div class="rounded-md border bg-background">
  <div
    class="flex flex-wrap gap-1 border-b p-1"
    role="toolbar"
    aria-label={m.editorToolbar}
    tabindex="-1"
    onkeydown={moveFocus}
  >
    {#each tools as tool, index (index)}
      {@const Icon = tool.icon}
      <button
        type="button"
        tabindex={index === focused ? 0 : -1}
        onfocus={() => (focused = index)}
        title={tool.label}
        aria-label={tool.label}
        aria-pressed={tool.active?.()}
        disabled={!editor}
        class="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 aria-pressed:bg-muted aria-pressed:text-foreground"
        onclick={tool.action}
      >
        <Icon class="size-4" />
      </button>
    {/each}
  </div>
  {#if inTable}
    <div class="flex flex-wrap gap-1 border-b bg-muted/40 p-1 text-xs">
      <Button
        size="sm"
        variant="ghost"
        onclick={() => run((c) => c.addRowAfter())}>{m.tableAddRow}</Button
      >
      <Button
        size="sm"
        variant="ghost"
        onclick={() => run((c) => c.addColumnAfter())}
        >{m.tableAddColumn}</Button
      >
      <Button
        size="sm"
        variant="ghost"
        onclick={() => run((c) => c.deleteRow())}>{m.tableDeleteRow}</Button
      >
      <Button
        size="sm"
        variant="ghost"
        onclick={() => run((c) => c.deleteColumn())}
        >{m.tableDeleteColumn}</Button
      >
      <Button
        size="sm"
        variant="ghost"
        onclick={() => run((c) => c.deleteTable())}>{m.tableDelete}</Button
      >
    </div>
  {/if}
  {#if image}
    <div
      class="flex flex-wrap items-end gap-3 border-b bg-muted/40 p-2 text-sm"
      role="group"
      aria-label={m.editorImageSettings}
    >
      <label class="grid min-w-48 flex-1 gap-1">
        {m.mediaAlt}
        <Input
          class="h-8"
          maxlength={500}
          value={image.alt ?? ''}
          oninput={(event) => setImage({ alt: event.currentTarget.value })}
          onkeydown={(event) => {
            // Enter returns to the text instead of submitting the content form.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            editor?.commands.focus();
          }}
        />
      </label>
      <label class="grid gap-1">
        {m.imageSize}
        <NativeSelect
          class="h-8"
          value={imageSize}
          onchange={(event) => resize(event.currentTarget.value)}
        >
          <NativeSelectOption value="thumbnail"
            >{m.sizeThumbnail}</NativeSelectOption
          >
          <NativeSelectOption value="medium">{m.sizeMedium}</NativeSelectOption>
          <NativeSelectOption value="">{m.sizeFull}</NativeSelectOption>
        </NativeSelect>
      </label>
    </div>
  {/if}
  <div bind:this={element}></div>
  {#if uploading || uploadErrors.length}
    <div class="border-t p-2 text-xs" aria-live="polite">
      {#if uploading}<p class="text-muted-foreground">
          {m.editorUploading(uploading)}
        </p>{/if}
      {#each uploadErrors as error (error)}<p class="text-destructive">
          {error}
        </p>{/each}
    </div>
  {/if}
</div>
<input type="hidden" {name} value={JSON.stringify(value)} />

<MediaPicker bind:this={picker} sizes onpick={insertImage} />
<MediaPicker
  kind="audio"
  bind:this={audioPicker}
  onpick={(media) =>
    run((chain) =>
      chain.insertContent({
        type: 'audio',
        attrs: { src: media.url, mediaId: media.id },
      }),
    )}
/>

<dialog
  bind:this={linkDialog}
  class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/40"
  aria-label={m.editorLink}
>
  <!-- Not a <form>: the editor sits inside the content form, and forms cannot nest. -->
  <div class="space-y-3">
    <label class="grid gap-2 text-sm">
      {m.linkUrl}
      <Input
        type="url"
        bind:value={linkUrl}
        placeholder="https://"
        onkeydown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          applyLink(linkUrl.trim());
        }}
      />
    </label>
    <div class="flex flex-wrap justify-end gap-2">
      {#if isActive('link')}
        <Button
          type="button"
          variant="ghost"
          class="mr-auto"
          onclick={() => applyLink('')}>{m.linkRemove}</Button
        >
      {/if}
      <Button type="button" variant="ghost" onclick={() => linkDialog.close()}
        >{m.cancel}</Button
      >
      <Button type="button" onclick={() => applyLink(linkUrl.trim())}
        >{m.apply}</Button
      >
    </div>
  </div>
</dialog>

<dialog
  bind:this={embedDialog}
  class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/40"
  aria-label={m.insertEmbed}
>
  <!-- Not a <form>: the editor sits inside the content form, and forms cannot nest. -->
  <div class="space-y-3">
    <label class="grid gap-2 text-sm">
      {m.embedUrl}
      <Input
        type="url"
        pattern="https://.*"
        bind:value={embedUrl}
        onkeydown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          insertEmbed();
        }}
      />
    </label>
    <div class="flex justify-end gap-2">
      <Button type="button" variant="ghost" onclick={() => embedDialog.close()}
        >{m.cancel}</Button
      >
      <Button type="button" onclick={insertEmbed}>{m.insert}</Button>
    </div>
  </div>
</dialog>
