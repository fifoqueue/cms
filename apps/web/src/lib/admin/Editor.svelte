<script lang="ts">
  import { Editor } from '@tiptap/core';
  import type { ChainedCommands } from '@tiptap/core';
  import type { EditorView } from '@tiptap/pm/view';
  import { CONTENT_ALIGNMENTS, IMAGE_SIZES } from '@cms/sdk';
  import type { AdminMedia, ContentDocument, PluginBlockInfo } from '@cms/sdk';
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
    Shapes,
  } from '@lucide/svelte';
  import BlockInserter from '#lib/admin/editor/BlockInserter.svelte';
  import { blockLabels } from '#lib/admin/editor/block-labels.js';
  import { codeBlockView } from '#lib/admin/editor/CodeBlockView.js';
  import { tocView } from '#lib/admin/editor/TocView.js';
  import {
    editorExtensions,
    loadPatterns,
  } from '#lib/admin/editor/patterns.js';
  import type { PatternChoice } from '#lib/admin/editor/patterns.js';
  import {
    loadPluginBlocks,
    pluginBlockView,
  } from '#lib/admin/editor/plugin-blocks.js';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import { sizeLabel } from '#lib/admin/image-sizes.js';
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
  import { MediaQuery, SvelteMap } from 'svelte/reactivity';

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
  let markers: { from: number; to: number }[] = [];

  /** Uploads dropped or pasted image files and inserts them at `position`. */
  /** `from`–`to` (a pasted-over selection) is replaced only once an image is ready. */
  const uploadInto = (
    view: EditorView,
    files: File[],
    from: number,
    to = from,
  ) => {
    const images = files.filter(isImage);
    if (!images.length) return false;
    const marker = { from, to };
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
            { from: marker.from, to: marker.to },
            imageNode(media, {
              alt: media.alt,
              variant: media.variants.find(
                (variant) => variant.name === 'large',
              ),
            }),
          )
          .run();
        // Later images follow the first one instead of replacing anything.
        marker.from = marker.to;
      }
      markers = markers.filter((other) => other !== marker);
    })();
    return true;
  };

  /** Active plugin blocks; until they load, plugin blocks show as inactive. */
  let pluginBlocks = $state<PluginBlockInfo[]>([]);
  const pluginBlock = pluginBlockView(
    (block) => pluginBlocks.find((entry) => entry.block === block)?.title,
    () => m.contentPluginBlockInactive,
  );

  onMount(() => {
    void loadPluginBlocks().then((list) => {
      pluginBlocks = list;
      pluginBlock.refresh();
    });
    const instance = new Editor({
      element,
      // The shared schema with editor placeholders for markers, patterns and plugin blocks.
      extensions: [
        ...editorExtensions(markerLabel).filter(
          (extension) =>
            extension.name !== 'pluginBlock' &&
            extension.name !== 'tableOfContents' &&
            extension.name !== 'codeBlock',
        ),
        pluginBlock.extension,
        tocView(() => m.contentTocEmpty),
        codeBlockView(() => ({
          name: m.contentBlockName('codeBlock'),
          auto: m.contentCodeAuto,
        })),
        blockLabels(['details', 'embed', 'spacer'], (type) =>
          m.contentBlockName(type),
        ),
      ],
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
          // Pasting replaces the selection, as it does for text, once the upload succeeds.
          const { from, to } = view.state.selection;
          return uploadInto(view, files, from, to);
        },
      },
      onTransaction: ({ transaction }) => {
        revision++;
        for (const marker of markers) {
          marker.from = transaction.mapping.map(marker.from);
          marker.to = transaction.mapping.map(marker.to);
        }
      },
      onUpdate: ({ editor: current }) =>
        (value = current.getJSON() as ContentDocument),
    });
    editor = instance;
    // Pattern boxes show their titles once the library is read.
    void loadPatterns().then((list) => {
      patterns = list?.items ?? [];
      for (const box of element.querySelectorAll<HTMLElement>(
        '[data-pattern-ref]',
      ))
        box.textContent = markerLabel(
          'patternRef',
          box.dataset.patternRef ?? null,
        );
    });
    return () => instance.destroy();
  });

  // Keep the caret clear of the sticky bars when the editor scrolls it into view, and of the
  // content form's fixed save bar on narrow screens (`--cms-save-bar-offset`, 0 when hidden).
  // Wide screens keep the whole bar group sticky; narrow ones only the format toolbar.
  let groupHeight = $state(0);
  let toolbarHeight = $state(0);
  let saveBarOffset = $state(0);
  const wide = new MediaQuery('min-width: 1024px');
  onMount(() => {
    const root = document.documentElement;
    const read = () =>
      (saveBarOffset =
        parseFloat(
          getComputedStyle(root).getPropertyValue('--cms-save-bar-offset'),
        ) || 0);
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  });
  $effect(() => {
    if (!editor) return;
    const margins = {
      top: (wide.current ? groupHeight : toolbarHeight) + 8,
      right: 0,
      bottom: saveBarOffset + 8,
      left: 0,
    };
    editor.view.setProps({ scrollThreshold: margins, scrollMargin: margins });
  });

  let patterns = $state<PatternChoice[]>([]);
  const markerLabel = (type: string, ref: string | null) =>
    type === 'more'
      ? m.contentMoreBreak
      : type === 'pageBreak'
        ? m.contentPageBreak
        : m.contentSyncedPattern(
            patterns.find((pattern) => pattern.id === ref)?.title ?? '',
          );

  // Save the selected blocks as a pattern; a synced one then replaces the selection.
  let patternDialog: HTMLDialogElement;
  let patternTitle = $state('');
  let patternSynced = $state(true);
  let patternError = $state('');
  const createPattern = async () => {
    if (!editor || !patternTitle.trim()) return;
    const { from, to } = editor.state.selection;
    const blocks = editor.state.doc
      .slice(from, to)
      .content.toJSON() as unknown[];
    const response = await fetch('/admin/patterns/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: patternTitle.trim(),
        synced: patternSynced,
        document: { type: 'doc', content: blocks },
      }),
    }).catch(() => null);
    const created =
      response?.status === 201
        ? ((await response.json()) as PatternChoice)
        : null;
    if (!created) {
      patternError = m.patternCreateFailed;
      return;
    }
    patterns = [...patterns, created];
    patternDialog.close();
    patternTitle = '';
    if (created.synced)
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from, to },
          { type: 'patternRef', attrs: { ref: created.id } },
        )
        .run();
  };

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

  /** Whether the picker swaps the selected image's file instead of inserting one. */
  let replacing = false;

  /** Inserts a library image; the media id keeps usage tracking accurate. */
  const insertImage = (media: AdminMedia, choice: MediaChoice) => {
    const node = imageNode(media, choice);
    // Replacing keeps the caption, alignment and link of the selected image.
    if (replacing) setImage(node.attrs);
    else run((chain) => chain.insertContent(node));
    replacing = false;
  };

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

  /** Enter returns to the text instead of submitting the content form. */
  const returnToText = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    editor?.commands.focus();
  };

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

  /** Library files of selected images, for their generated sizes (core and plugin-registered). */
  const files = new SvelteMap<string, AdminMedia | null>();
  $effect(() => {
    const id = image?.mediaId;
    if (typeof id !== 'string' || files.has(id)) return;
    files.set(id, null);
    void fetch(`/admin/media/picker?id=${encodeURIComponent(id)}`)
      .then((response) =>
        response.ok ? (response.json() as Promise<AdminMedia>) : null,
      )
      .catch(() => null)
      .then((media) => media && files.set(id, media));
  });
  const file = $derived(
    typeof image?.mediaId === 'string' ? files.get(image.mediaId) : null,
  );

  const imageSize = $derived(
    file
      ? (file.variants.find((variant) => variant.url === image?.src)?.name ??
          '')
      : image?.width === IMAGE_SIZES.thumbnail
        ? 'thumbnail'
        : image?.width === IMAGE_SIZES.medium
          ? 'medium'
          : '',
  );

  const resize = (size: string) => {
    if (file) {
      const variant = file.variants.find((entry) => entry.name === size);
      setImage(
        variant
          ? { src: variant.url, width: variant.width, height: variant.height }
          : { src: file.url, width: file.width, height: file.height },
      );
      return;
    }
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
    {
      label: m.editorImage,
      icon: Image,
      action: () => {
        replacing = false;
        picker.open();
      },
    },
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
    {
      label: m.patternCreate,
      icon: Shapes,
      action: () => {
        patternError = '';
        patternDialog.showModal();
      },
    },
    { label: m.editorUndo, icon: Undo, action: () => run((c) => c.undo()) },
    { label: m.editorRedo, icon: Redo, action: () => run((c) => c.redo()) },
  ]);
</script>

<div class="rounded-md border bg-background">
  <!-- The block and format bars (and table/image settings) stay at the top of the screen while
       a long document scrolls; narrow screens keep only the format bar there, so the pinned
       area stays short. Popovers are portaled above them (z-50). -->
  <div
    class="max-lg:contents lg:sticky lg:top-0 lg:z-10 lg:rounded-t-md lg:bg-background"
    bind:clientHeight={groupHeight}
  >
    <BlockInserter {editor} />
    <div
      class="flex flex-wrap gap-1 border-b bg-background p-1 max-lg:sticky max-lg:top-0 max-lg:z-10"
      bind:clientHeight={toolbarHeight}
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
          onmousedown={(event) => event.preventDefault()}
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
            onkeydown={returnToText}
          />
        </label>
        <label class="grid gap-1">
          {m.imageSize}
          <NativeSelect
            class="h-8"
            value={imageSize}
            onchange={(event) => resize(event.currentTarget.value)}
          >
            {#if file}
              {#each file.variants as variant (variant.name)}
                <NativeSelectOption value={variant.name}
                  >{sizeLabel(m, variant.name)} – {variant.width} × {variant.height}</NativeSelectOption
                >
              {/each}
            {:else}
              <NativeSelectOption value="thumbnail"
                >{m.sizeThumbnail}</NativeSelectOption
              >
              <NativeSelectOption value="medium"
                >{m.sizeMedium}</NativeSelectOption
              >
            {/if}
            <NativeSelectOption value="">{m.sizeFull}</NativeSelectOption>
          </NativeSelect>
        </label>
        <label class="grid gap-1">
          {m.contentAlignment}
          <NativeSelect
            class="h-8"
            value={image.align ?? 'center'}
            onchange={(event) => setImage({ align: event.currentTarget.value })}
          >
            {#each CONTENT_ALIGNMENTS as align (align)}<NativeSelectOption
                value={align}
                >{m.contentAlignmentName(align)}</NativeSelectOption
              >{/each}
          </NativeSelect>
        </label>
        <label class="grid min-w-48 flex-1 gap-1">
          {m.contentCaption}
          <Input
            class="h-8"
            maxlength={2000}
            value={image.caption ?? ''}
            oninput={(event) =>
              setImage({ caption: event.currentTarget.value })}
            onkeydown={returnToText}
          />
        </label>
        <label class="grid min-w-48 flex-1 gap-1">
          {m.contentLink}
          <Input
            class="h-8"
            type="url"
            maxlength={2048}
            placeholder="https://"
            value={image.href ?? ''}
            oninput={(event) =>
              setImage({ href: event.currentTarget.value.trim() || null })}
            onkeydown={returnToText}
          />
        </label>
        <label class="flex h-8 items-center gap-2">
          <input
            type="checkbox"
            checked={image.newTab === true}
            onchange={(event) =>
              setImage({ newTab: event.currentTarget.checked })}
          />{m.contentNewTab}
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onclick={() => {
            replacing = true;
            picker.open();
          }}>{m.mediaChoose}</Button
        >
      </div>
    {/if}
  </div>
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
  bind:this={patternDialog}
  class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/40"
  aria-label={m.patternCreate}
>
  <!-- Not a <form>: the editor sits inside the content form, and forms cannot nest. -->
  <div class="space-y-3">
    <p class="text-sm text-muted-foreground">{m.patternCreateHelp}</p>
    <label class="grid gap-2 text-sm">
      {m.fieldTitle}
      <Input
        maxlength={191}
        bind:value={patternTitle}
        onkeydown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          void createPattern();
        }}
      />
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={patternSynced} />
      {m.patternSynced}
    </label>
    {#if patternError}<p class="text-sm text-destructive" role="alert">
        {patternError}
      </p>{/if}
    <div class="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        onclick={() => patternDialog.close()}>{m.cancel}</Button
      >
      <Button
        type="button"
        disabled={!patternTitle.trim()}
        onclick={createPattern}>{m.create}</Button
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
