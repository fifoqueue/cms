<script lang="ts">
  import '#lib/theme/site.css';
  import { routeLink } from '#lib/route-link.js';
  import { page } from '$app/state';
  import type { SlotMap } from '@cms/sdk';
  import { buildHead, sitePage } from '#lib/seo/head.js';
  import type { SeoMeta } from '#lib/seo/head.js';
  import SeoHead from '#lib/seo/SeoHead.svelte';
  import Toasts from '#lib/components/Toasts.svelte';
  import NavigationProgress from '#lib/components/NavigationProgress.svelte';
  import AdminBar from '#lib/theme/AdminBar.svelte';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import ThemeStylesheet from '#lib/theme/ThemeStylesheet.svelte';
  import SiteFonts from '#lib/theme/SiteFonts.svelte';
  import {
    rememberedScheme,
    SCHEME_ATTRIBUTE,
    SCHEME_KEY,
    schemeCss,
    schemeScript,
    siteScheme,
    themeStyle,
  } from '#lib/theme/style.js';
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
      // Set by the page's server load when a plugin's `seo.meta` filter changed the head.
      filtered: page.data.seoMeta as SeoMeta | null | undefined,
    }),
  );

  /** Over the back-to-top button: its own bottom (`ReadingProgress`), height and a gap. */
  const TOAST_LIFT =
    'max(1rem, env(safe-area-inset-bottom), var(--cms-bulk-bar-offset, 0px) + 0.75rem) + 2.5rem';

  // The visitor's light/dark choice: the alternate palette's CSS and the script that restores it.
  const schemeStyle = $derived(schemeCss(data.theme));
  const remembered = $derived(schemeScript(data.theme));
  // The head script only runs on document loads; client navigation into the site and theme
  // changes apply the stored choice here (the site editor and admin never set the attribute).
  $effect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SCHEME_KEY);
    } catch {
      // Storage may be unavailable; the theme's own scheme shows.
    }
    const value = rememberedScheme(data.theme, stored);
    if (value) document.documentElement.setAttribute(SCHEME_ATTRIBUTE, value);
    else document.documentElement.removeAttribute(SCHEME_ATTRIBUTE);
  });

  // Every page loads its own slots; error pages have none.
  const slots = $derived(page.data.slots as SlotMap | undefined);
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
  {#if schemeStyle}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from schema-checked palette colors -->
    {@html `<style>${schemeStyle}</style>`}
  {/if}
  {#if remembered}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- a fixed script; runs before the first paint so a chosen scheme never flashes -->
    {@html remembered}
  {/if}
</svelte:head>
<ThemeStylesheet css={data.theme.css} />
<SiteFonts fonts={data.theme.fonts} />

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
  <!-- Inside the site wrapper so it takes the theme's accent, over the admin toolbar too. -->
  <NavigationProgress />
  <!-- Inside the site wrapper for the theme's colors; above the back-to-top button (3rem)
       and the comment bulk bar (`--cms-bulk-bar-offset`). -->
  <Toasts theme={siteScheme(data.theme) ?? 'light'} lift={TOAST_LIFT}>
    {#if data.theme.preview && !data.toolbar}
      <p
        class="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
        role="status"
      >
        {i18n.m.themePreviewing(data.theme.name)}
        <a
          {...routeLink('/admin/(app)/appearance/preview/exit')}
          class="ml-2 underline">{i18n.m.themePreviewExit}</a
        >
      </p>
    {/if}
    {@render children()}
  </Toasts>
</div>
