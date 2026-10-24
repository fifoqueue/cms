<script lang="ts">
  import { resolve } from '$app/paths';
  import { ArrowRight } from '@lucide/svelte';
  import type { Block } from '@cms/sdk';
  import { useI18n } from '#lib/i18n/index.js';
  import { useCurrentPost, useScope } from '#lib/theme/scope.js';

  /** The author of the current entry; the avatar and bio come with a single entry's page. */
  let { block }: { block: Extract<Block, { name: 'post-author' }> } = $props();

  const current = useCurrentPost();
  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const author = $derived(current().post?.author ?? null);
  const details = $derived(
    author ? (scope().authors?.[author.slug] ?? null) : null,
  );
</script>

{#if author}
  {@const href = resolve('/(site)/author/[slug]', { slug: author.slug })}
  <aside
    aria-label={m.themeWrittenBy}
    class="cms-block-post-author flex items-start gap-4 rounded-xl border bg-card p-5 text-card-foreground @min-[40rem]:p-6"
  >
    {#if block.attrs.showAvatar}
      {#if details?.avatarUrl}
        <img
          src={details.avatarUrl}
          alt=""
          width="56"
          height="56"
          loading="lazy"
          class="size-14 shrink-0 rounded-full"
        />
      {:else}
        <span
          aria-hidden="true"
          class="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground uppercase"
          >{[...author.name][0]}</span
        >
      {/if}
    {/if}
    <div class="grid min-w-0 gap-1">
      <p
        class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {m.themeWrittenBy}
      </p>
      <a
        {href}
        rel="author"
        class="text-lg font-semibold break-words hover:underline"
        >{author.name}</a
      >
      {#if block.attrs.showBio && details?.bio}
        <p class="text-sm leading-relaxed text-muted-foreground">
          {details.bio}
        </p>
      {/if}
      <a
        {href}
        class="mt-1 inline-flex items-center gap-1 justify-self-start text-sm font-medium text-primary hover:underline"
        >{m.themeAuthorPosts(author.name)}<ArrowRight
          class="size-3.5"
          aria-hidden="true"
        /></a
      >
    </div>
  </aside>
{/if}
