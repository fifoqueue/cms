<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { useI18n } from '#lib/i18n/index.js';
  import { useCurrentPost } from '#lib/theme/scope.js';

  let { moreLink, length = 0 }: { moreLink: boolean; length?: number } =
    $props();

  const current = useCurrentPost();
  const i18n = useI18n();
  const post = $derived(current().post);
  /** The excerpt cut to `length` words (0 keeps it whole), ending in an ellipsis when cut. */
  const text = $derived.by(() => {
    const excerpt = post?.excerpt ?? '';
    const words = excerpt.trim().split(/\s+/);
    return length && words.length > length
      ? `${words.slice(0, length).join(' ')}…`
      : excerpt;
  });
</script>

{#if post?.excerpt}
  <div class="cms-block-post-excerpt space-y-2">
    <p class="leading-relaxed text-muted-foreground">{text}</p>
    {#if moreLink}
      <a
        href={resolve(post.path as Path)}
        class="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >{i18n.m.themeReadMore}<span aria-hidden="true">→</span><span
          class="sr-only">: {post.title}</span
        ></a
      >
    {/if}
  </div>
{/if}
