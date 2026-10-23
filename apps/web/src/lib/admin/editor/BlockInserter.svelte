<script lang="ts">
  import type { Editor, JSONContent } from '@tiptap/core';
  import type { AdminMedia, MediaKind } from '@cms/sdk';
  import { Popover } from 'bits-ui';
  import { Plus } from '@lucide/svelte';
  import { tick } from 'svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import BlockOptions from '#lib/admin/editor/BlockOptions.svelte';
  import { mediaNode } from '#lib/admin/editor/blocks.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import '#lib/theme/site.css';

  let { editor }: { editor: Editor | null } = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  let open = $state(false);
  let search = $state('');
  let revision = $state(0);
  let picker: ReturnType<typeof MediaPicker>;
  let mediaKind = $state<MediaKind>('image');
  let pending = $state('image');
  const blocks = [
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'blockquote',
    'image',
    'audio',
    'video',
    'file',
    'gallery',
    'columns',
    'buttons',
    'details',
    'pullquote',
    'table',
    'horizontalRule',
    'spacer',
    'codeBlock',
    'embed',
  ];
  const matches = $derived(
    blocks.filter((type) =>
      `${m.contentBlockName(type)} ${type}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
  );

  $effect(() => {
    const current = editor;
    if (!current) return;
    const changed = () => {
      revision += 1;
    };
    const slash = (event: KeyboardEvent) => {
      const { selection } = current.state;
      if (
        event.key !== '/' ||
        event.isComposing ||
        !selection.empty ||
        selection.$from.parent.type.name !== 'paragraph' ||
        selection.$from.parent.content.size !== 0
      )
        return;
      event.preventDefault();
      search = '';
      open = true;
    };
    current.on('transaction', changed);
    current.view.dom.addEventListener('keydown', slash);
    return () => {
      current.off('transaction', changed);
      current.view.dom.removeEventListener('keydown', slash);
    };
  });

  const insert = (content: JSONContent) =>
    editor?.chain().focus().insertContent(content).run();
  const pick = (media: AdminMedia) => {
    if (media.kind !== mediaKind) return;
    const node = mediaNode(media);
    insert(pending === 'gallery' ? { type: 'gallery', content: [node] } : node);
  };

  const choose = async (type: string) => {
    if (!editor) return;
    open = false;
    search = '';
    if (['image', 'audio', 'video', 'file', 'gallery'].includes(type)) {
      pending = type;
      mediaKind =
        type === 'file'
          ? 'document'
          : type === 'audio'
            ? 'audio'
            : type === 'video'
              ? 'video'
              : 'image';
      await tick();
      picker.open();
      return;
    }
    const paragraph = { type: 'paragraph' };
    if (type === 'table') {
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
      return;
    }
    const nodes: Record<string, JSONContent> = {
      heading: { type, attrs: { level: 2 } },
      bulletList: {
        type,
        content: [{ type: 'listItem', content: [paragraph] }],
      },
      orderedList: {
        type,
        content: [{ type: 'listItem', content: [paragraph] }],
      },
      blockquote: { type, content: [paragraph] },
      pullquote: { type, content: [paragraph] },
      columns: {
        type,
        content: [0, 1].map(() => ({ type: 'column', content: [paragraph] })),
      },
      buttons: {
        type,
        content: [
          {
            type: 'button',
            content: [{ type: 'text', text: m.contentButtonLabel }],
          },
        ],
      },
      details: {
        type,
        content: [
          {
            type: 'detailsSummary',
            content: [{ type: 'text', text: m.contentDetailsSummary }],
          },
          { type: 'detailsContent', content: [paragraph] },
        ],
      },
    };
    insert(nodes[type] ?? { type });
  };
</script>

<div class="flex flex-wrap items-center gap-1 border-b p-1">
  <Popover.Root bind:open>
    <Popover.Trigger
      type="button"
      disabled={!editor}
      aria-label={m.contentInsertBlock}
      title={m.contentInsertBlock}
      class="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      ><Plus class="size-4" />{m.contentInsertBlock}</Popover.Trigger
    >
    <Popover.Portal>
      <Popover.Content
        sideOffset={8}
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
        class="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
      >
        <Input
          type="search"
          bind:value={search}
          placeholder={m.contentSearchBlocks}
          aria-label={m.contentSearchBlocks}
          onkeydown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              void choose(matches[0]);
            }
          }}
        />
        <ul class="mt-2 grid max-h-80 grid-cols-2 gap-1 overflow-y-auto">
          {#each matches as type (type)}<li>
              <button
                type="button"
                class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onclick={() => choose(type)}>{m.contentBlockName(type)}</button
              >
            </li>{/each}
        </ul>
        {#if !matches.length}<p class="p-3 text-sm text-muted-foreground">
            {m.contentNoBlocks}
          </p>{/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {#if editor}<BlockOptions {editor} {revision} />{/if}
</div>
<MediaPicker bind:this={picker} kind={mediaKind} onpick={pick} />
