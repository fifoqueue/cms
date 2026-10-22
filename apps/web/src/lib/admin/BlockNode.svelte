<script lang="ts">
  import { BLOCKS } from '@cms/sdk';
  import type { Block, BlockAttr, BlockName } from '@cms/sdk';
  import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    Plus,
    Trash2,
  } from '@lucide/svelte';
  import BlockNode from '#lib/admin/BlockNode.svelte';
  import {
    allowedBlocks,
    blockSummary,
    canHaveChildren,
    newBlock,
  } from '#lib/admin/blocks.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    /** The list this block sits in; moving and removing change it in place. */
    list: Block[];
    index: number;
    parent: BlockName | null;
    colors: { slug: string; name: string }[];
    parts: string[];
  }

  let { list, index, parent, colors, parts }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const block = $derived(list[index]!);
  const attrs = $derived(
    Object.entries(BLOCKS[block.name].attrs) as [string, BlockAttr][],
  );
  const values = $derived(block.attrs as Record<string, unknown>);
  const choices = $derived(allowedBlocks(block.name));
  const id = $props.id();

  let open = $state(false);
  // svelte-ignore state_referenced_locally
  let adding = $state<BlockName>(
    allowedBlocks(list[index]!.name)[0] ?? 'group',
  );

  const move = (offset: number) => {
    const [item] = list.splice(index, 1);
    list.splice(index + offset, 0, item!);
  };
  const set = (key: string, value: unknown) => {
    (block.attrs as Record<string, unknown>)[key] = value;
  };
</script>

<div class="rounded-md border bg-card" data-parent={parent ?? undefined}>
  <div class="flex items-center gap-1 py-1 pr-1 pl-2">
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted"
      aria-expanded={open}
      aria-controls="{id}-body"
      onclick={() => (open = !open)}
    >
      <ChevronRight
        class="size-4 shrink-0 text-muted-foreground transition {open
          ? 'rotate-90'
          : ''}"
      />
      <span class="font-medium">{m.blockName(block.name)}</span>
      <span class="truncate text-muted-foreground">{blockSummary(block)}</span>
      {#if block.children.length}
        <span class="ml-auto shrink-0 text-xs text-muted-foreground"
          >{block.children.length}</span
        >
      {/if}
    </button>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-7"
      disabled={index === 0}
      aria-label={m.moveUp}
      onclick={() => move(-1)}><ArrowUp class="size-3.5" /></Button
    >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-7"
      disabled={index === list.length - 1}
      aria-label={m.moveDown}
      onclick={() => move(1)}><ArrowDown class="size-3.5" /></Button
    >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-7 text-destructive"
      aria-label={m.editorRemoveBlock}
      onclick={() => list.splice(index, 1)}><Trash2 class="size-3.5" /></Button
    >
  </div>
  {#if open}
    <div id="{id}-body" class="space-y-3 border-t px-3 py-3">
      {#if attrs.length}
        <div class="grid gap-3 sm:grid-cols-2">
          {#each attrs as [key, attr] (key)}
            <label class="grid gap-1.5 text-sm">
              {#if attr.type === 'boolean'}
                <span class="flex h-9 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={values[key] === true}
                    onchange={(event) => set(key, event.currentTarget.checked)}
                  />
                  {m.blockAttr(key)}
                </span>
              {:else}
                <span class="font-medium">{m.blockAttr(key)}</span>
                {#if attr.type === 'enum'}
                  <NativeSelect
                    class="w-full"
                    value={values[key] as string}
                    onchange={(event) => set(key, event.currentTarget.value)}
                  >
                    {#each attr.options as option (option)}
                      <NativeSelectOption value={option}
                        >{m.blockOption(option)}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                {:else if attr.type === 'color'}
                  <NativeSelect
                    class="w-full"
                    value={values[key] as string}
                    onchange={(event) => set(key, event.currentTarget.value)}
                  >
                    <NativeSelectOption value=""
                      >{m.editorColorDefault}</NativeSelectOption
                    >
                    {#each colors as color (color.slug)}
                      <NativeSelectOption value={color.slug}
                        >{color.name}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                {:else if attr.type === 'number'}
                  <Input
                    type="number"
                    min={attr.min}
                    max={attr.max}
                    value={values[key] as number}
                    oninput={(event) =>
                      set(
                        key,
                        Math.round(Number(event.currentTarget.value) || 0),
                      )}
                  />
                {:else if block.name === 'template-part' && key === 'slug'}
                  <NativeSelect
                    class="w-full"
                    value={values[key] as string}
                    onchange={(event) => set(key, event.currentTarget.value)}
                  >
                    {#each parts as part (part)}
                      <NativeSelectOption value={part}
                        >{part}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                {:else if key === 'text' && attr.max > 200}
                  <textarea
                    rows="3"
                    maxlength={attr.max}
                    value={values[key] as string}
                    oninput={(event) => set(key, event.currentTarget.value)}
                    class="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  ></textarea>
                {:else}
                  <Input
                    value={values[key] as string}
                    maxlength={attr.max}
                    oninput={(event) => set(key, event.currentTarget.value)}
                  />
                {/if}
              {/if}
            </label>
          {/each}
        </div>
      {/if}
      {#if canHaveChildren(block.name)}
        <div class="space-y-2 border-l-2 border-dashed pl-3">
          {#each block.children, childIndex (childIndex)}
            <BlockNode
              list={block.children}
              index={childIndex}
              parent={block.name}
              {colors}
              {parts}
            />
          {/each}
          {#if choices.length}
            <div class="flex flex-wrap items-center gap-2">
              <NativeSelect
                bind:value={adding}
                size="sm"
                aria-label={m.editorAddInside}
              >
                {#each choices as name (name)}
                  <NativeSelectOption value={name}
                    >{m.blockName(name)}</NativeSelectOption
                  >
                {/each}
              </NativeSelect>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onclick={() => block.children.push(newBlock(adding))}
                ><Plus class="size-4" /> {m.editorAddInside}</Button
              >
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
