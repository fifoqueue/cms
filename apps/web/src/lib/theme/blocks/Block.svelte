<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { Block } from '@cms/sdk';
  import PrivacyPolicyLink from '#lib/theme/PrivacyPolicyLink.svelte';
  import Breadcrumbs from '#lib/seo/Breadcrumbs.svelte';
  import { crumbs } from '#lib/seo/head.js';
  import type { SitePage } from '#lib/seo/head.js';
  import { useI18n } from '#lib/i18n/index.js';
  import WidgetArea from '#lib/theme/WidgetArea.svelte';
  import type { Path } from '$app/types';
  import BlockList from '#lib/theme/blocks/BlockList.svelte';
  import Calendar from '#lib/theme/blocks/Calendar.svelte';
  import MediaBlock from '#lib/theme/blocks/MediaBlock.svelte';
  import PostAuthor from '#lib/theme/blocks/PostAuthor.svelte';
  import Buttons from '#lib/theme/blocks/Buttons.svelte';
  import Columns from '#lib/theme/blocks/Columns.svelte';
  import CommentsBlock from '#lib/theme/blocks/CommentsBlock.svelte';
  import ContentTypeNav from '#lib/theme/blocks/ContentTypeNav.svelte';
  import Group from '#lib/theme/blocks/Group.svelte';
  import Navigation from '#lib/theme/blocks/Navigation.svelte';
  import PostContent from '#lib/theme/blocks/PostContent.svelte';
  import PostExcerpt from '#lib/theme/blocks/PostExcerpt.svelte';
  import PostFeaturedImage from '#lib/theme/blocks/PostFeaturedImage.svelte';
  import PostFields from '#lib/theme/blocks/PostFields.svelte';
  import PostMeta from '#lib/theme/blocks/PostMeta.svelte';
  import PostNavigation from '#lib/theme/blocks/PostNavigation.svelte';
  import PostTerms from '#lib/theme/blocks/PostTerms.svelte';
  import PostTitle from '#lib/theme/blocks/PostTitle.svelte';
  import Query from '#lib/theme/blocks/Query.svelte';
  import QueryTitle from '#lib/theme/blocks/QueryTitle.svelte';
  import SchemeToggle from '#lib/theme/blocks/SchemeToggle.svelte';
  import SearchForm from '#lib/theme/blocks/SearchForm.svelte';
  import SocialLinks from '#lib/theme/blocks/SocialLinks.svelte';
  import TemplatePart from '#lib/theme/blocks/TemplatePart.svelte';
  import { useCurrentPost, useScope } from '#lib/theme/scope.js';

  /** One block of a template; the theme decides which and where, the core how. */
  let { block }: { block: Block } = $props();

  const scope = useScope();
  const current = useCurrentPost();
  const i18n = useI18n();

  const ALIGN = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  } as const;
  const SPACER = {
    none: 'h-0',
    small: 'h-4',
    medium: 'h-8',
    large: 'h-16',
  } as const;
  const TEXT = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  } as const;
  const TITLE = {
    small: 'text-base',
    medium: 'text-xl',
    large: 'text-2xl @min-[40rem]:text-3xl',
  } as const;
  const HEADING = [
    '',
    'text-4xl',
    'text-3xl',
    'text-2xl',
    'text-xl',
    'text-lg',
    'text-base',
  ];
</script>

{#if block.name === 'group'}
  <Group {block} />
{:else if block.name === 'columns'}
  <Columns {block} />
{:else if block.name === 'template-part'}
  <TemplatePart slug={block.attrs.slug} />
{:else if block.name === 'site-title'}
  <svelte:element
    this={block.attrs.level ? `h${block.attrs.level}` : 'p'}
    class="cms-block-site-title cms-heading font-semibold tracking-tight {TITLE[
      block.attrs.size
    ]}"
  >
    {#if block.attrs.link}
      <a href={resolve('/(site)')} class="hover:opacity-80"
        >{scope().site.title}</a
      >
    {:else}{scope().site.title}{/if}
  </svelte:element>
{:else if block.name === 'site-tagline'}
  {#if scope().site.description}
    <p class="cms-block-site-tagline text-sm text-muted-foreground">
      {scope().site.description}
    </p>
  {/if}
{:else if block.name === 'site-logo'}
  {@const logo = scope().site.logo}
  {#if logo}
    <svelte:element
      this={block.attrs.link ? 'a' : 'div'}
      href={block.attrs.link ? resolve('/(site)') : undefined}
      class="cms-block-site-logo block shrink-0"
      style:width="{block.attrs.width}px"
    >
      <img
        src={logo.sizes.find((size) => size.width >= block.attrs.width * 2)
          ?.url ?? logo.url}
        alt={block.attrs.link ? scope().site.title : logo.alt}
        width={block.attrs.width}
        height={logo.width && logo.height
          ? Math.round((block.attrs.width * logo.height) / logo.width)
          : undefined}
        class="h-auto w-full"
      />
    </svelte:element>
  {/if}
{:else if block.name === 'privacy-policy-link'}
  <PrivacyPolicyLink policy={scope().privacy?.policy} />
{:else if block.name === 'navigation'}
  <Navigation {block} />
{:else if block.name === 'search'}
  <SearchForm showLabel={block.attrs.showLabel} panel={block.attrs.panel} />
{:else if block.name === 'scheme-toggle'}
  <SchemeToggle />
{:else if block.name === 'widget-area'}
  {#if scope().widgets[block.attrs.area].length}
    <div class="cms-block-widget-area">
      <WidgetArea
        widgets={scope().widgets[block.attrs.area]}
        locale={scope().site.locale}
        layout={block.attrs.layout}
      />
    </div>
  {/if}
{:else if block.name === 'post-title'}
  <PostTitle {block} />
{:else if block.name === 'post-meta'}
  <PostMeta {block} />
{:else if block.name === 'post-content'}
  <PostContent />
{:else if block.name === 'post-excerpt'}
  <PostExcerpt
    moreLink={block.attrs.moreLink}
    length={block.attrs.excerptLength}
  />
{:else if block.name === 'post-featured-image'}
  <PostFeaturedImage {block} />
{:else if block.name === 'post-terms'}
  <PostTerms taxonomy={block.attrs.taxonomy} />
{:else if block.name === 'post-fields'}
  <PostFields />
{:else if block.name === 'comments'}
  <CommentsBlock />
{:else if block.name === 'post-navigation'}
  <PostNavigation {block} />
{:else if block.name === 'breadcrumbs'}
  {@const page = scope().page}
  {#if page.kind === 'content' || page.kind === 'term'}
    <Breadcrumbs items={crumbs(page as SitePage, i18n.m)} />
  {/if}
{:else if block.name === 'query'}
  <Query {block} />
{:else if block.name === 'query-title'}
  <QueryTitle {block} />
{:else if block.name === 'content-type-nav'}
  <ContentTypeNav />
{:else if block.name === 'heading'}
  {#if block.attrs.text}
    <svelte:element
      this={`h${block.attrs.level}`}
      class="cms-block-heading cms-heading font-semibold tracking-tight {HEADING[
        block.attrs.level
      ]} {ALIGN[block.attrs.align]}">{block.attrs.text}</svelte:element
    >
  {/if}
{:else if block.name === 'paragraph'}
  {#if block.attrs.text}
    <p
      class="cms-block-paragraph whitespace-pre-line {ALIGN[
        block.attrs.align
      ]} {TEXT[block.attrs.size]}"
      class:text-muted-foreground={block.attrs.muted}
    >
      {block.attrs.text}
    </p>
  {/if}
{:else if block.name === 'separator'}
  <hr class="cms-block-separator my-2 border-border" />
{:else if block.name === 'spacer'}
  <div
    class="cms-block-spacer {SPACER[block.attrs.size]}"
    aria-hidden="true"
  ></div>
{:else if block.name === 'buttons'}
  <Buttons {block} />
{:else if block.name === 'social-links'}
  <SocialLinks {block} />
{:else if block.name === 'latest-posts' || block.name === 'categories' || block.name === 'tag-cloud' || block.name === 'archives' || block.name === 'latest-comments'}
  <BlockList {block} />
{:else if block.name === 'image' || block.name === 'cover' || block.name === 'media-text'}
  <MediaBlock {block} />
{:else if block.name === 'post-author'}
  <PostAuthor {block} />
{:else if block.name === 'read-more'}
  {@const post = current().post}
  {#if post}
    <a
      href={resolve(post.path as Path)}
      class="cms-block-read-more inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >{block.attrs.text || i18n.m.themeReadMore}<span class="sr-only"
        >: {post.title}</span
      ></a
    >
  {/if}
{:else if block.name === 'page-list'}
  {#if scope().pageTree?.length}
    <ul class="cms-block-page-list space-y-1 text-sm">
      {#each scope().pageTree ?? [] as entry (entry.path)}
        <li style:padding-inline-start="{entry.depth}rem">
          <a href={resolve(entry.path as Path)} class="hover:underline"
            >{entry.title}</a
          >
        </li>
      {/each}
    </ul>
  {/if}
{:else if block.name === 'calendar'}
  <Calendar />
{:else if block.name === 'loginout'}
  {#if scope().signedIn}
    <form
      method="POST"
      action={resolve('/admin/logout')}
      class="cms-block-loginout text-sm"
    >
      <button type="submit" class="hover:underline">{i18n.m.signOut}</button>
    </form>
  {:else if scope().site.showLogin}
    {@const back = `${page.url.pathname}${page.url.search}`}
    <a
      href={resolve(
        `${scope().site.loginPath}?${new URLSearchParams({ redirect_to: back })}` as Path,
      )}
      class="cms-block-loginout text-sm hover:underline">{i18n.m.themeSignIn}</a
    >
  {/if}
{:else if block.name === 'copyright'}
  <p class="cms-block-copyright text-sm text-muted-foreground">
    © {new Date().getFullYear()}
    {scope().site.title}
  </p>
{/if}
