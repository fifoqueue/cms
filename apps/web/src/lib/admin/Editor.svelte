<script lang="ts">
  import { Editor } from '@tiptap/core';
  import type { ChainedCommands } from '@tiptap/core';
  import { contentExtensions } from '@cms/content';
  import type { ContentDocument } from '@cms/sdk';
  import type { AdminMedia } from '@cms/sdk';
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
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';

  interface Props {
    /** Form field that receives the document as JSON. */
    name: string;
    value: ContentDocument;
  }

  let { name, value = $bindable() }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let audioPicker: ReturnType<typeof MediaPicker>;
  let picker: ReturnType<typeof MediaPicker>;
  let embedDialog: HTMLDialogElement;
  let embedUrl = $state('');

  let element: HTMLDivElement;
  let editor = $state.raw<Editor | null>(null);
  // Bumped on every transaction so toolbar state re-renders.
  let revision = $state(0);

  onMount(() => {
    const instance = new Editor({
      element,
      extensions: contentExtensions,
      content: value,
      editorProps: {
        attributes: {
          class:
            'prose max-w-none min-h-80 px-4 py-3 focus:outline-none dark:prose-invert',
        },
      },
      onTransaction: () => revision++,
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
    const previous =
      (editor?.getAttributes('link').href as string | undefined) ?? '';
    const href = window.prompt('Link URL (empty to remove)', previous);
    if (href === null) return;
    run((chain) =>
      href
        ? chain.extendMarkRange('link').setLink({ href })
        : chain.extendMarkRange('link').unsetLink(),
    );
  };

  /** Inserts a library image; the media id keeps usage tracking accurate. */
  const insertImage = (media: AdminMedia) =>
    run((chain) =>
      chain.insertContent({
        type: 'image',
        attrs: {
          src:
            media.variants.find((variant) => variant.name === 'large')?.url ??
            media.url,
          alt: media.alt,
          mediaId: media.id,
          width: media.width,
          height: media.height,
        },
      }),
    );

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

  interface Tool {
    label: string;
    icon: Component;
    active?: () => boolean;
    action: () => void;
  }

  const tools: Tool[] = [
    {
      label: 'Bold',
      icon: Bold,
      active: () => isActive('bold'),
      action: () => run((c) => c.toggleBold()),
    },
    {
      label: 'Italic',
      icon: Italic,
      active: () => isActive('italic'),
      action: () => run((c) => c.toggleItalic()),
    },
    {
      label: 'Strikethrough',
      icon: Strikethrough,
      active: () => isActive('strike'),
      action: () => run((c) => c.toggleStrike()),
    },
    {
      label: 'Inline code',
      icon: Code,
      active: () => isActive('code'),
      action: () => run((c) => c.toggleCode()),
    },
    {
      label: 'Link',
      icon: Link,
      active: () => isActive('link'),
      action: editLink,
    },
    {
      label: 'Heading 2',
      icon: Heading2,
      active: () => isActive('heading', { level: 2 }),
      action: () => run((c) => c.toggleHeading({ level: 2 })),
    },
    {
      label: 'Heading 3',
      icon: Heading3,
      active: () => isActive('heading', { level: 3 }),
      action: () => run((c) => c.toggleHeading({ level: 3 })),
    },
    {
      label: 'Bullet list',
      icon: List,
      active: () => isActive('bulletList'),
      action: () => run((c) => c.toggleBulletList()),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      active: () => isActive('orderedList'),
      action: () => run((c) => c.toggleOrderedList()),
    },
    {
      label: 'Quote',
      icon: Quote,
      active: () => isActive('blockquote'),
      action: () => run((c) => c.toggleBlockquote()),
    },
    {
      label: 'Code block',
      icon: SquareCode,
      active: () => isActive('codeBlock'),
      action: () => run((c) => c.toggleCodeBlock()),
    },
    { label: 'Image', icon: Image, action: () => picker.open() },
    {
      get label() {
        return m.mediaAudio;
      },
      icon: Music,
      action: () => audioPicker.open(),
    },
    {
      label: 'Table',
      icon: Table,
      active: () => isActive('table'),
      action: () =>
        run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
    },
    {
      label: 'Embed',
      icon: SquarePlay,
      action: () => embedDialog.showModal(),
    },
    { label: 'Undo', icon: Undo, action: () => run((c) => c.undo()) },
    { label: 'Redo', icon: Redo, action: () => run((c) => c.redo()) },
  ];
</script>

<div class="rounded-md border bg-background">
  <div
    class="flex flex-wrap gap-1 border-b p-1"
    role="toolbar"
    aria-label="Formatting"
  >
    {#each tools as tool (tool.label)}
      {@const Icon = tool.icon}
      <button
        type="button"
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
  <div bind:this={element}></div>
</div>
<input type="hidden" {name} value={JSON.stringify(value)} />

<MediaPicker bind:this={picker} onpick={insertImage} />
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
