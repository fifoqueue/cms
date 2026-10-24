<script lang="ts">
  import type { Editor, JSONContent } from '@tiptap/core';
  import type { AdminMedia, MediaKind, PluginBlockInfo } from '@cms/sdk';
  import { Popover } from 'bits-ui';
  import { Plus } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import BlockOptions from '#lib/admin/editor/BlockOptions.svelte';
  import { mediaNode } from '#lib/admin/editor/blocks.js';
  import { loadPluginBlocks } from '#lib/admin/editor/plugin-blocks.js';
  import { loadPatterns, patternContent } from '#lib/admin/editor/patterns.js';
  import type { PatternChoice } from '#lib/admin/editor/patterns.js';
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
  /** How the menu was opened, and whether it ended in a choice or Escape (decides where focus goes). */
  let slashed = false;
  let chosen = false;
  let escaped = false;
  const blocks = [
    'paragraph',
    'heading',
    'tableOfContents',
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
    'callout',
    'table',
    'horizontalRule',
    'spacer',
    'codeBlock',
    'embed',
    'more',
    'pageBreak',
  ];
  /** Blocks of active plugins, inserted as the shared `pluginBlock` node. */
  let pluginBlocks = $state<PluginBlockInfo[]>([]);
  onMount(() => {
    void loadPluginBlocks().then((list) => (pluginBlocks = list));
  });
  const name = (type: string) =>
    pluginBlocks.find((entry) => entry.block === type)?.title ??
    m.contentBlockName(type);
  let library = $state<PatternChoice[]>([]);
  let patternPage = $state(1);
  let patternTotal = $state(0);
  let patternLoading = $state(false);
  let patternError = $state('');
  let inserting = $state(false);
  let lastSearch = '';
  $effect(() => {
    if (!open) return;
    const query = search.trim();
    if (query !== lastSearch) {
      lastSearch = query;
      patternPage = 1;
    }
    const page = patternPage;
    const controller = new AbortController();
    patternLoading = true;
    patternError = '';
    const timer = setTimeout(async () => {
      const result = await loadPatterns(query, page, controller.signal);
      if (controller.signal.aborted) return;
      patternLoading = false;
      if (!result) {
        library = [];
        patternTotal = 0;
        patternError = m.patternLoadFailed;
        return;
      }
      library = result.items;
      patternTotal = Math.ceil(result.total / result.pageSize);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  const insertPattern = async (pattern: PatternChoice) => {
    if (!editor || inserting) return;
    const current = editor;
    const state = current.state;
    inserting = true;
    const content = await patternContent(pattern);
    inserting = false;
    if (
      !open ||
      !content ||
      current.isDestroyed ||
      editor !== current ||
      current.state.doc !== state.doc
    ) {
      patternError = m.patternLoadFailed;
      return;
    }
    chosen = true;
    open = false;
    search = '';
    current
      .chain()
      .focus()
      .insertContentAt(
        { from: state.selection.from, to: state.selection.to },
        content,
      )
      .run();
  };
  const matches = $derived(
    [...blocks, ...pluginBlocks.map((entry) => entry.block)].filter((type) =>
      `${name(type)} ${type}`
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
      slashed = true;
      open = true;
    };
    current.on('transaction', changed);
    current.view.dom.addEventListener('keydown', slash);
    return () => {
      current.off('transaction', changed);
      current.view.dom.removeEventListener('keydown', slash);
    };
  });

  const insert = (content: JSONContent | JSONContent[]) =>
    editor?.chain().focus().insertContent(content).run();
  const pick = (media: AdminMedia) => {
    if (media.kind !== mediaKind) return;
    const node = mediaNode(media);
    insert(pending === 'gallery' ? { type: 'gallery', content: [node] } : node);
  };

  const choose = async (type: string) => {
    if (!editor) return;
    chosen = true;
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
    if (type.startsWith('plugin:')) {
      // Declared defaults apply when it renders; Block settings changes them.
      insert({ type: 'pluginBlock', attrs: { block: type, attrs: {} } });
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
      tableOfContents: {
        type,
        attrs: { title: m.contentTocDefaultTitle },
      },
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
      callout: { type, content: [paragraph] },
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
        onEscapeKeydown={() => (escaped = true)}
        onCloseAutoFocus={(event) => {
          // A choice moves focus itself (into the text or the media picker). Escaping the slash
          // menu returns to the text at the kept selection; the + button gets focus back otherwise.
          if (chosen || slashed) event.preventDefault();
          if (slashed && escaped && !chosen) editor?.commands.focus();
          slashed = chosen = escaped = false;
        }}
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
                onclick={() => choose(type)}>{name(type)}</button
              >
            </li>{/each}
        </ul>
        {#if !matches.length}<p class="p-3 text-sm text-muted-foreground">
            {m.contentNoBlocks}
          </p>{/if}
        {#if library.length}
          <h3 class="mt-3 px-1 text-xs font-medium text-muted-foreground">
            {m.patternsTitle}
          </h3>
          <ul class="mt-1 grid max-h-40 gap-1 overflow-y-auto">
            {#each library as pattern (pattern.id)}<li>
                <button
                  type="button"
                  class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  disabled={inserting || patternLoading}
                  onclick={() => insertPattern(pattern)}
                  >{pattern.title}{pattern.synced
                    ? ` · ${m.patternSyncedShort}`
                    : ''}</button
                >
              </li>{/each}
          </ul>
        {/if}
        {#if patternError}<p role="alert" class="mt-2 text-sm text-destructive">
            {patternError}
          </p>{/if}
        {#if patternTotal > 1}
          <div
            class="mt-2 flex items-center justify-between text-xs"
            aria-busy={patternLoading}
          >
            <button
              type="button"
              disabled={patternPage <= 1 || patternLoading}
              onclick={() => patternPage--}>{m.previous}</button
            >
            <span>{m.pageOf(patternPage, patternTotal)}</span>
            <button
              type="button"
              disabled={patternPage >= patternTotal || patternLoading}
              onclick={() => patternPage++}>{m.next}</button
            >
          </div>
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {#if editor}<BlockOptions {editor} {revision} />{/if}
</div>
<MediaPicker bind:this={picker} kind={mediaKind} onpick={pick} />
