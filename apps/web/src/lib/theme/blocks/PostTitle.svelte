<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import type { Block } from '@cms/sdk';
  import { useCurrentPost } from '#lib/theme/scope.js';

  let { block }: { block: Extract<Block, { name: 'post-title' }> } = $props();

  const current = useCurrentPost();
  const SIZE = {
    small: 'text-lg',
    medium: 'text-xl',
    large: 'text-2xl sm:text-[1.75rem] leading-tight',
    xlarge: 'text-3xl sm:text-5xl leading-[1.1]',
  } as const;
  const post = $derived(current().post);
</script>

{#if post}
  <svelte:element
    this={`h${block.attrs.level}`}
    class="cms-block-post-title cms-heading font-semibold tracking-tight text-balance {SIZE[
      block.attrs.size
    ]}"
  >
    {#if block.attrs.link}
      <a
        href={resolve(post.path as Path)}
        class="decoration-primary/60 decoration-2 underline-offset-4 hover:underline"
        >{post.title}</a
      >
    {:else}{post.title}{/if}
  </svelte:element>
{/if}
