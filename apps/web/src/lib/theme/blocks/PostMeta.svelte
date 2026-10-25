<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import type { Block } from '@cms/sdk';
  import { default as MessageCircle } from '@lucide/svelte/icons/message-circle';
  import { isArticle } from '#lib/seo/head.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { useDateFormat } from '#lib/theme/format.js';
  import { useCurrentPost } from '#lib/theme/scope.js';

  let { block }: { block: Extract<Block, { name: 'post-meta' }> } = $props();

  const current = useCurrentPost();
  const formatDate = useDateFormat();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const a = $derived(block.attrs);
  const post = $derived(current().post);
  const entry = $derived(current().entry);
  // Single entries show the byline their structured data states (SEO author when set).
  const seoAuthor = $derived(
    entry && isArticle(entry) && entry.seo.authorName ? entry.seo : null,
  );
  const published = $derived(post ? formatDate(post.publishedAt) : '');
  const updated = $derived(entry ? formatDate(entry.updatedAt) : '');
</script>

{#if post && post.type !== 'page'}
  <p
    class="cms-block-post-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
  >
    {#if a.showSticky && post.sticky && !entry}
      <span
        class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >{m.stickyLabel}</span
      >
    {/if}
    {#if a.showDate}
      <time datetime={post.publishedAt}>{published}</time>
    {/if}
    {#if a.showUpdated && entry && updated !== published}
      <span aria-hidden="true">·</span>
      <span
        >{m.updatedOn} <time datetime={entry.updatedAt}>{updated}</time></span
      >
    {/if}
    {#if a.showAuthor && (seoAuthor || post.author)}
      <span aria-hidden="true">·</span>
      <span>
        {m.byAuthor}
        {#if seoAuthor}
          {#if seoAuthor.authorUrl}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- external author profile -->
            <a
              href={seoAuthor.authorUrl}
              rel="author"
              class="text-foreground hover:underline">{seoAuthor.authorName}</a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          {:else}{seoAuthor.authorName}{/if}
        {:else if post.author}
          <a
            href={resolve('/(site)/author/[slug]', { slug: post.author.slug })}
            rel="author"
            class="text-foreground hover:underline">{post.author.name}</a
          >
        {/if}
      </span>
    {/if}
    {#if a.showComments && a.commentIcon}
      {#if a.showDate || a.showAuthor}<span aria-hidden="true">·</span>{/if}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- the resolved entry path plus its comments anchor -->
      <a
        href={`${resolve(post.path as Path)}#comments`}
        class="cms-post-comments inline-flex items-baseline hover:text-foreground"
        aria-label={m.commentCount(post.commentCount)}
        ><MessageCircle class="size-3 self-center" aria-hidden="true" /><span
          aria-hidden="true">{post.commentCount}</span
        ></a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {:else if a.showComments && post.commentCount}
      <span aria-hidden="true">·</span>
      <!-- eslint-disable svelte/no-navigation-without-resolve -- the resolved entry path plus its comments anchor -->
      <a
        href={`${resolve(post.path as Path)}#comments`}
        class="hover:text-foreground">{m.commentCount(post.commentCount)}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {/if}
  </p>
{/if}
