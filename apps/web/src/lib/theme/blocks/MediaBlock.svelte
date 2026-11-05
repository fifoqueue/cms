<script lang="ts">
  import type { Block } from '@cms/sdk';
  import Blocks from '#lib/theme/blocks/Blocks.svelte';
  import { linkOptions } from '#lib/route-link.js';
  import { useScope } from '#lib/theme/scope.js';
  import { useI18n } from '#lib/i18n/context.js';
  import Lightbox from '#lib/theme/Lightbox.svelte';
  import ResponsiveImage from '#lib/theme/ResponsiveImage.svelte';
  import { themeImage } from '#lib/theme/image.js';

  /** Image, Cover and Media & Text: media-library images only (`MEDIA_IMAGE`). */
  let {
    block,
  }: { block: Extract<Block, { name: 'image' | 'cover' | 'media-text' }> } =
    $props();
  const scope = useScope();
  const media = $derived(
    themeImage(
      scope().images,
      block.attrs.src,
      'alt' in block.attrs ? block.attrs.alt : '',
      block.name === 'cover',
    ),
  );
  const i18n = useI18n();
  const m = $derived(i18n.m);
  /** Image and Media & Text pictures open in a lightbox unless the Image block has a link. */
  let zoomed = $state(false);
  const zoom = $derived(
    block.name !== 'cover' && block.attrs.src
      ? {
          src: media.url,
          alt: media.alt,
          caption: block.name === 'image' ? block.attrs.caption : '',
        }
      : null,
  );
  const ZOOM_BUTTON =
    'block w-full cursor-zoom-in rounded-[var(--radius)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

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
        <ResponsiveImage
          image={media}
          sizes={a.width
            ? `(max-width: ${a.width}px) 100vw, ${a.width}px`
            : '(min-width: 64rem) 48rem, 100vw'}
          class="h-auto w-full {a.rounded ? 'rounded-[var(--radius)]' : ''}"
        />
      {/snippet}
      {#if a.link}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a site path or external address chosen by admins -->
        <a href={a.link} {...linkOptions(scope().linkRoutes[a.link])}
          >{@render image()}</a
        >
      {:else}
        <button
          type="button"
          class={ZOOM_BUTTON}
          aria-haspopup="dialog"
          aria-label={a.alt ? undefined : m.themeLightboxOpen}
          onclick={() => (zoomed = true)}>{@render image()}</button
        >
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
      <ResponsiveImage
        image={media}
        eager
        sizes="100vw"
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
        <button
          type="button"
          class={ZOOM_BUTTON}
          aria-haspopup="dialog"
          aria-label={a.alt ? undefined : m.themeLightboxOpen}
          onclick={() => (zoomed = true)}
          ><ResponsiveImage
            image={media}
            sizes={`(min-width: 48rem) ${a.mediaWidth}vw, 100vw`}
            class="h-auto w-full rounded-[var(--radius)]"
          /></button
        >
      {/if}
    </figure>
    <div class="flex flex-col gap-4">
      <Blocks blocks={block.children} />
    </div>
  </div>
{/if}
{#if zoom}
  <Lightbox items={[zoom]} bind:open={zoomed} />
{/if}
