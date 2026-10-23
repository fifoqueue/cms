<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Block } from '@cms/sdk';
  import { useCurrentPost, useScope } from '#lib/theme/scope.js';

  /** The author of the current entry; the avatar and bio come with a single entry's page. */
  let { block }: { block: Extract<Block, { name: 'post-author' }> } = $props();

  const current = useCurrentPost();
  const scope = useScope();
  const author = $derived(current().post?.author ?? null);
  const details = $derived(
    author ? (scope().authors?.[author.slug] ?? null) : null,
  );
</script>

{#if author}
  <div class="cms-block-post-author flex items-start gap-3">
    {#if block.attrs.showAvatar && details?.avatarUrl}
      <img
        src={details.avatarUrl}
        alt=""
        width="48"
        height="48"
        loading="lazy"
        class="size-12 shrink-0 rounded-full"
      />
    {/if}
    <div class="min-w-0 space-y-1">
      <a
        href={resolve('/(site)/author/[slug]', { slug: author.slug })}
        rel="author"
        class="font-medium hover:underline">{author.name}</a
      >
      {#if block.attrs.showBio && details?.bio}
        <p class="text-sm text-muted-foreground">{details.bio}</p>
      {/if}
    </div>
  </div>
{/if}
