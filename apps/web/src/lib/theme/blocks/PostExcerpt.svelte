<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { useI18n } from '#lib/i18n/index.js';
  import { useCurrentPost } from '#lib/theme/scope.js';

  let { moreLink }: { moreLink: boolean } = $props();

  const current = useCurrentPost();
  const i18n = useI18n();
  const post = $derived(current().post);
</script>

{#if post?.excerpt}
  <div class="cms-block-post-excerpt space-y-2">
    <p class="leading-relaxed text-muted-foreground">{post.excerpt}</p>
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
