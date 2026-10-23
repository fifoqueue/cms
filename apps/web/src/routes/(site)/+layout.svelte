<script lang="ts">
  import '#lib/theme/site.css';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { SlotMap } from '@cms/sdk';
  import { buildHead, sitePage } from '#lib/seo/head.js';
  import SeoHead from '#lib/seo/SeoHead.svelte';
  import AdminBar from '#lib/theme/AdminBar.svelte';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import { scopedCss, themeStyle } from '#lib/theme/style.js';
  import { provideI18n } from '#lib/i18n/index.js';
  import { provideDateStyle } from '#lib/theme/format.js';
  import type { LayoutProps } from './$types';

  /** The page shell: theme variables and stylesheet, head, toolbar. Templates draw the rest. */
  let { data, children }: LayoutProps = $props();

  const i18n = provideI18n(() => data.site.locale);
  provideDateStyle(() => ({
    locale: data.site.locale,
    dateFormat: data.reading.dateFormat,
    timeZone: data.reading.timeZone,
  }));

  // One metadata set per page, from this layout's settings and the page's projected data.
  const head = $derived(
    buildHead({
      site: data.site,
      settings: data.seo,
      page: sitePage(page.data),
    }),
  );

  // Every page loads its own slots; error pages have none.
  const slots = $derived(page.data.slots as SlotMap | undefined);
  const css = $derived(scopedCss(data.theme.css));
</script>

<SeoHead {head} />

<svelte:head>
  {#if data.site.icon}
    <link
      rel="icon"
      href={data.site.icon.sizes[0]?.url ?? data.site.icon.url}
    />
    <link rel="apple-touch-icon" href={data.site.icon.url} />
  {/if}
  <SlotOutlet fragments={slots?.head ?? []} />
  {#if css}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the theme stylesheet, checked by cssProblem (no markup, no resources, balanced braces) -->
    {@html `<style>${css}</style>`}
  {/if}
</svelte:head>

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-lg"
  >{i18n.m.themeSkipToContent}</a
>

{#if data.toolbar}
  <AdminBar
    user={data.toolbar}
    siteTitle={data.site.title}
    previewing={data.theme.preview ? data.theme.name : null}
  />
{/if}

<div
  class="cms-site flex min-h-screen flex-col bg-background text-foreground"
  class:pt-8={data.toolbar}
  style="{themeStyle(data.theme)}{data.toolbar
    ? '; --cms-admin-bar: 2rem'
    : ''}"
  lang={data.site.locale}
  data-theme={data.theme.id}
>
  {#if data.theme.preview && !data.toolbar}
    <p
      class="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
      role="status"
    >
      {i18n.m.themePreviewing(data.theme.name)}
      <a
        href={resolve('/admin/(app)/appearance/preview/exit')}
        data-sveltekit-reload
        class="ml-2 underline">{i18n.m.themePreviewExit}</a
      >
    </p>
  {/if}
  {@render children()}
</div>
