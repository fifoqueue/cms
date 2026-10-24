<script lang="ts">
  import type { Block } from '@cms/sdk';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import { linkOptions } from '#lib/route-link.js';
  import { useScope } from '#lib/theme/scope.js';

  /** Image, Cover and Media & Text: media-library images only (`MEDIA_IMAGE`). */
  let {
    block,
  }: { block: Extract<Block, { name: 'image' | 'cover' | 'media-text' }> } =
    $props();
  const scope = useScope();

  const ALIGN = {
    left: 'mr-auto',
    center: 'mx-auto',
    right: 'ml-auto',
  } as const;
  const TEXT_ALIGN = {
    left: 'items-start text-left',
    center: 'items-center text-center',
    right: 'items-end text-right',
  } as const;
  const HEIGHT = {
    small: 'min-h-48',
    medium: 'min-h-80',
    large: 'min-h-[32rem]',
  } as const;
</script>

{#if block.name === 'image'}
  {#if block.attrs.src}
    {@const a = block.attrs}
    <figure
      class="cms-block-image flex max-w-full flex-col gap-2 {ALIGN[a.align]}"
      style:width={a.width ? `${a.width}px` : undefined}
    >
      {#snippet image()}
        <img
          src={a.src}
          alt={a.alt}
          loading="lazy"
          decoding="async"
          class="h-auto w-full {a.rounded ? 'rounded-[var(--radius)]' : ''}"
        />
      {/snippet}
      {#if a.link}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a site path or external address chosen by admins -->
        <a href={a.link} {...linkOptions(scope().linkRoutes[a.link])}
          >{@render image()}</a
        >
      {:else}
        {@render image()}
      {/if}
      {#if a.caption}
        <figcaption class="text-center text-sm text-muted-foreground">
          {a.caption}
        </figcaption>
      {/if}
    </figure>
  {/if}
{:else if block.name === 'cover'}
  {@const a = block.attrs}
  <div
    class="cms-block-cover relative flex flex-col justify-center overflow-hidden rounded-[var(--radius)] p-8 {HEIGHT[
      a.minHeight
    ]} {TEXT_ALIGN[a.align]}"
    style:color={a.overlayColor ? 'var(--cms-color-base)' : undefined}
  >
    {#if a.src}
      <img
        src={a.src}
        alt=""
        loading="lazy"
        decoding="async"
        class="absolute inset-0 size-full object-cover"
      />
    {/if}
    {#if a.overlayColor}
      <span
        class="absolute inset-0"
        aria-hidden="true"
        style:background-color="var(--cms-color-{a.overlayColor})"
        style:opacity={a.dim / 100}
      ></span>
    {/if}
    <div class="relative flex flex-col gap-4">
      <Blocks blocks={block.children} />
    </div>
  </div>
{:else}
  {@const a = block.attrs}
  <div
    class="cms-block-media-text grid items-center gap-6 @min-[48rem]:grid-cols-[var(--cms-media-columns)]"
    style:--cms-media-columns={a.mediaPosition === 'left'
      ? `${a.mediaWidth}% 1fr`
      : `1fr ${a.mediaWidth}%`}
  >
    <figure class={a.mediaPosition === 'right' ? '@min-[48rem]:order-2' : ''}>
      {#if a.src}
        <img
          src={a.src}
          alt={a.alt}
          loading="lazy"
          decoding="async"
          class="h-auto w-full rounded-[var(--radius)]"
        />
      {/if}
    </figure>
    <div class="flex flex-col gap-4">
      <Blocks blocks={block.children} />
    </div>
  </div>
{/if}
