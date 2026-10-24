<script lang="ts">
  import type { Block } from '@cms/sdk';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';

  let { block }: { block: Extract<Block, { name: 'group' }> } = $props();

  const GAP = {
    none: 'gap-0',
    small: 'gap-2',
    medium: 'gap-4',
    large: 'gap-8',
  } as const;
  const PADDING = {
    none: '',
    small: 'py-3',
    medium: 'py-4 @min-[40rem]:py-5',
    large: 'py-10 @min-[40rem]:py-14',
  } as const;
  const BOX_PADDING = {
    none: '',
    small: 'p-3',
    medium: 'p-5',
    large: 'p-8',
  } as const;
  const WIDTH = {
    content: 'max-w-[var(--cms-content-size)]',
    wide: 'max-w-[var(--cms-wide-size)]',
    full: '',
  } as const;
  const JUSTIFY = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
  } as const;
  const ITEMS = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  } as const;
  const GRID = [
    '',
    'grid-cols-1',
    '@min-[40rem]:grid-cols-2',
    '@min-[40rem]:grid-cols-2 @min-[64rem]:grid-cols-3',
    '@min-[40rem]:grid-cols-2 @min-[64rem]:grid-cols-4',
    '@min-[40rem]:grid-cols-3 @min-[64rem]:grid-cols-5',
    '@min-[40rem]:grid-cols-3 @min-[64rem]:grid-cols-6',
  ];
  const BORDER = {
    none: '',
    top: 'border-t',
    bottom: 'border-b',
    both: 'border-y',
    box: 'rounded-[var(--radius)] border',
  } as const;

  const a = $derived(block.attrs);
  const style = $derived(
    [
      a.background && `background-color: var(--cms-color-${a.background})`,
      a.textColor && `color: var(--cms-color-${a.textColor})`,
    ]
      .filter(Boolean)
      .join('; ') || undefined,
  );
  const layout = $derived(
    a.layout === 'flex'
      ? `flex ${a.wrap ? 'flex-wrap' : 'flex-nowrap'} ${JUSTIFY[a.justify]} ${ITEMS[a.align]} ${GAP[a.gap]}`
      : a.layout === 'grid'
        ? `grid grid-cols-1 ${GRID[a.columns]} ${GAP[a.gap]}`
        : a.layout === 'stack'
          ? `flex flex-col ${ITEMS[a.align]} ${GAP[a.gap]}`
          : '',
  );
</script>

<svelte:element
  this={a.tagName}
  class="cms-block-group {a.className ? `theme-${a.className}` : ''} {BORDER[
    a.border
  ]} {a.border === 'box'
    ? BOX_PADDING[a.padding]
    : PADDING[a.padding]} {layout}"
  class:cms-constrained={a.layout === 'constrained'}
  class:cms-sticky={a.sticky}
  id={a.tagName === 'main' ? 'main' : undefined}
  tabindex={a.tagName === 'main' ? -1 : undefined}
  {style}
>
  {#if a.layout === 'constrained'}
    <div
      class="cms-inner mx-auto flex w-full min-w-0 flex-col px-4 @min-[40rem]:px-6 {WIDTH[
        a.width
      ]} {GAP[a.gap]}"
    >
      <Blocks blocks={block.children} />
    </div>
  {:else}
    <Blocks blocks={block.children} />
  {/if}
</svelte:element>
