<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import type { Block } from '@cms/sdk';
  import ResponsiveImage from '#lib/theme/ResponsiveImage.svelte';
  import { useCurrentPost } from '#lib/theme/scope.js';

  let { block }: { block: Extract<Block, { name: 'post-featured-image' }> } =
    $props();

  const current = useCurrentPost();
  const ASPECT = {
    auto: 'h-auto',
    wide: 'aspect-video object-cover',
    standard: 'aspect-[4/3] object-cover',
    square: 'aspect-square object-cover',
  } as const;
  const post = $derived(current().post);
  const entry = $derived(current().entry);
  const classes = $derived(
    `w-full ${ASPECT[block.attrs.aspect]} ${block.attrs.rounded ? 'rounded-[var(--radius)]' : ''}`,
  );
</script>

{#if post?.featuredImage}
  <figure class="cms-block-post-featured-image overflow-hidden">
    {#if block.attrs.link && !entry}
      <a
        href={resolve(post.path as Path)}
        tabindex="-1"
        aria-hidden="true"
        class="block"
      >
        <ResponsiveImage
          image={post.featuredImage}
          sizes="(min-width: 64rem) 40rem, 100vw"
          class="{classes} transition duration-300 hover:scale-[1.02]"
        />
      </a>
    {:else}
      <ResponsiveImage
        image={post.featuredImage}
        sizes="(min-width: 64rem) 64rem, 100vw"
        class={classes}
        eager={!!entry}
      />
    {/if}
  </figure>
{:else if entry?.seo.imageUrl}
  <img
    src={entry.seo.imageUrl}
    alt={entry.seo.imageAlt}
    class="cms-block-post-featured-image {classes}"
  />
{/if}
