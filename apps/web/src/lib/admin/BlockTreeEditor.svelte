<script lang="ts">
  import type { Block, BlockName } from '@cms/sdk';
  import type { Snippet } from 'svelte';
  import BlockInserter from '#lib/admin/BlockInserter.svelte';
  import BlockListView from '#lib/admin/BlockListView.svelte';
  import BlockSettings from '#lib/admin/BlockSettings.svelte';
  import {
    allowedBlocks,
    blockAt,
    insertAt,
    insertionPoint,
    newBlock,
    pathKey,
    slotAt,
  } from '#lib/admin/blocks.js';
  import type { BlockPath } from '#lib/admin/blocks.js';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * The WordPress-style site editor around the canvas: List View on the left, the canvas in
   * the middle (`canvas`, given the selection), block settings and the inserter on the right.
   */
  interface Props {
    blocks: Block[];
    /** Palette slugs for color settings. */
    colors: { slug: string; name: string }[];
    /** Template part slugs for the template-part block. */
    parts: string[];
    /** Told whether the tree differs from what the server last returned. */
    onchange?: (dirty: boolean, tree: Block[]) => void;
    /** Told the selected block's path key (digits and dots), or null. */
    onselect?: (key: string | null) => void;
    canvas: Snippet<[(path: BlockPath) => void, string | null]>;
  }

  let { blocks, colors, parts, onchange, onselect, canvas }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  // svelte-ignore state_referenced_locally
  const tree = $state(structuredClone($state.snapshot(blocks)) as Block[]);
  // Compared with what the server last returned, so saving clears it.
  const initial = $derived(JSON.stringify(blocks));
  const json = $derived(JSON.stringify(tree));
  $effect(() => onchange?.(json !== initial, JSON.parse(json) as Block[]));

  let selected = $state<BlockPath | null>(null);
  const block = $derived(selected ? blockAt(tree, selected) : null);
  const key = $derived(selected && block ? pathKey(selected) : null);
  $effect(() => onselect?.(key));

  /** Blocks that fit where the inserter would put them. */
  const insertable = $derived(
    (allowedBlocks(null) as BlockName[])
      .concat(block ? allowedBlocks(block.name) : [])
      .filter((name, index, all) => all.indexOf(name) === index),
  );

  const select = (path: BlockPath) => {
    selected = blockAt(tree, path) ? path : null;
  };
  const move = (path: BlockPath, offset: number) => {
    const slot = slotAt(tree, path);
    if (!slot) return;
    const target = slot.index + offset;
    if (target < 0 || target >= slot.list.length) return;
    const [item] = slot.list.splice(slot.index, 1);
    slot.list.splice(target, 0, item!);
    selected = [...path.slice(0, -1), target];
  };
  const remove = (path: BlockPath) => {
    const slot = slotAt(tree, path);
    if (!slot) return;
    slot.list.splice(slot.index, 1);
    selected = null;
  };
  const insert = (name: BlockName) => {
    const path = insertionPoint(tree, selected, name);
    insertAt(tree, path, newBlock(name));
    selected = path;
  };
</script>

<input type="hidden" name="blocks" value={json} />

<!-- Canvas beside a sidebar (List View above the settings); List View moves left on wide screens. -->
<div
  class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start 2xl:grid-cols-[14rem_minmax(0,1fr)_18rem]"
>
  <section
    aria-label={m.editorListView}
    class="max-h-[50vh] overflow-y-auto rounded-md border p-2 lg:col-start-2 lg:row-start-1 2xl:col-start-1 2xl:row-span-2 2xl:max-h-[80vh]"
  >
    <h3 class="px-2 pb-2 text-sm font-medium">{m.editorListView}</h3>
    {#if tree.length}
      <BlockListView
        blocks={tree}
        selected={key}
        onselect={select}
        onmove={move}
        onremove={remove}
      />
    {:else}
      <p class="p-4 text-center text-sm text-muted-foreground">
        {m.editorNoBlocks}
      </p>
    {/if}
  </section>

  <div
    class="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1 2xl:col-start-2"
  >
    {@render canvas(select, key)}
  </div>

  <aside
    aria-label={m.editorBlockSettings}
    class="space-y-4 rounded-md border p-3 lg:col-start-2 lg:row-start-2 2xl:col-start-3 2xl:row-span-2 2xl:row-start-1"
  >
    <section class="space-y-3">
      <h3 class="text-sm font-medium">
        {block ? m.blockName(block.name) : m.editorBlockSettings}
      </h3>
      {#if block}
        {#key key}
          <BlockSettings {block} {colors} {parts} />
        {/key}
      {:else}
        <p class="text-sm text-muted-foreground">{m.editorSelectBlock}</p>
      {/if}
    </section>
    <section class="space-y-2 border-t pt-3">
      <h3 class="text-sm font-medium">{m.editorAddBlock}</h3>
      <BlockInserter allowed={insertable} onpick={insert} />
    </section>
  </aside>
</div>
