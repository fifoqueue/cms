<script lang="ts">
  import type { Block } from '@cms/sdk';
  import { default as ArrowDown } from '@lucide/svelte/icons/arrow-down';
  import { default as ArrowUp } from '@lucide/svelte/icons/arrow-up';
  import { default as Trash2 } from '@lucide/svelte/icons/trash-2';
  import BlockListView from '#lib/admin/BlockListView.svelte';
  import { blockSummary, pathKey } from '#lib/admin/blocks.js';
  import type { BlockPath } from '#lib/admin/blocks.js';
  import { useI18n } from '#lib/i18n/index.js';

  /** WordPress List View: the block tree with select, move and remove. */
  interface Props {
    blocks: Block[];
    /** Path of `blocks`' container; `[]` at the root. */
    base?: BlockPath;
    selected: string | null;
    onselect: (path: BlockPath) => void;
    onmove: (path: BlockPath, offset: number) => void;
    onremove: (path: BlockPath) => void;
  }

  let {
    blocks,
    base = [],
    selected,
    onselect,
    onmove,
    onremove,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const control =
    'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30';
</script>

<ul class={base.length ? 'ml-3 border-l pl-2' : ''} role="group">
  {#each blocks as block, index (index)}
    {@const path = [...base, index]}
    <li>
      <div
        class="group flex items-center gap-1 rounded-md pr-1 {selected ===
        pathKey(path)
          ? 'bg-primary/10'
          : 'hover:bg-muted'}"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-baseline gap-2 px-2 py-1 text-left text-sm"
          aria-current={selected === pathKey(path) ? 'true' : undefined}
          onclick={() => onselect(path)}
        >
          <span
            class="min-w-0 shrink truncate font-medium"
            title={m.blockName(block.name)}>{m.blockName(block.name)}</span
          >
          <span
            class="min-w-0 shrink-[4] truncate text-xs text-muted-foreground"
            >{blockSummary(block)}</span
          >
        </button>
        <button
          type="button"
          class={control}
          disabled={index === 0}
          aria-label="{m.moveUp}: {m.blockName(block.name)}"
          onclick={() => onmove(path, -1)}><ArrowUp class="size-3.5" /></button
        >
        <button
          type="button"
          class={control}
          disabled={index === blocks.length - 1}
          aria-label="{m.moveDown}: {m.blockName(block.name)}"
          onclick={() => onmove(path, 1)}><ArrowDown class="size-3.5" /></button
        >
        <button
          type="button"
          class="{control} hover:text-destructive"
          aria-label="{m.editorRemoveBlock}: {m.blockName(block.name)}"
          onclick={() => onremove(path)}><Trash2 class="size-3.5" /></button
        >
      </div>
      {#if block.children.length}
        <BlockListView
          blocks={block.children}
          base={path}
          {selected}
          {onselect}
          {onmove}
          {onremove}
        />
      {/if}
    </li>
  {/each}
</ul>
