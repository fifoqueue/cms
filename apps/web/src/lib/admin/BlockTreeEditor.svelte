<script lang="ts">
  import type { Block, BlockName } from '@cms/sdk';
  import { Plus } from '@lucide/svelte';
  import BlockNode from '#lib/admin/BlockNode.svelte';
  import { allowedBlocks, newBlock } from '#lib/admin/blocks.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    blocks: Block[];
    /** Palette slugs for color settings. */
    colors: { slug: string; name: string }[];
    /** Template part slugs for the template-part block. */
    parts: string[];
    /** Told whether the tree differs from what the server last returned. */
    onchange?: (dirty: boolean, tree: Block[]) => void;
  }

  let { blocks, colors, parts, onchange }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  // svelte-ignore state_referenced_locally
  const tree = $state(structuredClone($state.snapshot(blocks)) as Block[]);
  // Compared with what the server last returned, so saving clears it.
  const initial = $derived(JSON.stringify(blocks));
  const json = $derived(JSON.stringify(tree));
  $effect(() => onchange?.(json !== initial, JSON.parse(json) as Block[]));

  let adding = $state<BlockName>('group');
</script>

<input type="hidden" name="blocks" value={json} />

<div class="space-y-2">
  {#each tree, index (index)}
    <BlockNode list={tree} {index} parent={null} {colors} {parts} />
  {:else}
    <p
      class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
    >
      {m.editorNoBlocks}
    </p>
  {/each}
</div>
<div class="flex flex-wrap items-center gap-2 pt-2">
  <NativeSelect bind:value={adding} aria-label={m.editorAddBlock} size="sm">
    {#each allowedBlocks(null) as name (name)}
      <NativeSelectOption value={name}>{m.blockName(name)}</NativeSelectOption>
    {/each}
  </NativeSelect>
  <Button
    type="button"
    variant="outline"
    size="sm"
    onclick={() => tree.push(newBlock(adding))}
    ><Plus class="size-4" /> {m.editorAddBlock}</Button
  >
</div>
