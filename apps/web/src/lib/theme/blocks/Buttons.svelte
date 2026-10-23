<script lang="ts">
  import type { Block } from '@cms/sdk';
  import { linkOptions } from '#lib/route-link.js';
  import { useScope } from '#lib/theme/scope.js';

  /** Link buttons in a row; buttons without text or address are left out. */
  let { block }: { block: Extract<Block, { name: 'buttons' }> } = $props();
  const scope = useScope();

  const JUSTIFY = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
  } as const;
  const STYLE = {
    fill: 'bg-primary text-primary-foreground hover:opacity-90',
    outline: 'border border-current hover:bg-muted',
  } as const;
</script>

<div
  class="cms-block-buttons flex flex-wrap gap-3 {JUSTIFY[block.attrs.justify]}"
>
  {#each block.children as button, index (index)}
    {#if button.name === 'button' && button.attrs.text && button.attrs.url}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- site paths or external addresses chosen by admins -->
      <a
        href={button.attrs.url}
        {...linkOptions(scope().linkRoutes[button.attrs.url])}
        target={button.attrs.newTab ? '_blank' : undefined}
        rel={button.attrs.newTab ? 'noopener' : undefined}
        class="cms-block-button inline-flex items-center rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition {STYLE[
          button.attrs.style
        ]}">{button.attrs.text}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {/if}
  {/each}
</div>
