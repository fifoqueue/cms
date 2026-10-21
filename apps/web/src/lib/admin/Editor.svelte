<script lang="ts">
  import { Editor } from '@tiptap/core';
  import type { ChainedCommands } from '@tiptap/core';
  import { contentExtensions } from '@cms/content';
  import type { ContentDocument } from '@cms/sdk';
  import {
    Bold,
    Code,
    Heading2,
    Heading3,
    Italic,
    Link,
    List,
    ListOrdered,
    Quote,
    Redo,
    SquareCode,
    Strikethrough,
    Undo,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';

  interface Props {
    /** Form field that receives the document as JSON. */
    name: string;
    value: ContentDocument;
  }

  let { name, value = $bindable() }: Props = $props();

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
  <div bind:this={element}></div>
</div>
<input type="hidden" {name} value={JSON.stringify(value)} />
