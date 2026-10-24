<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import type { Snippet } from 'svelte';
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
  } from '#lib/components/ui/card/index.js';
  import { DARK_QUERY } from '#lib/admin/color-mode.js';
  import { provideToasts } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { authMessages } from '#lib/i18n/auth.js';
  import PrivacyPolicyLink from '#lib/theme/PrivacyPolicyLink.svelte';

  /**
   * The frame of every sign-in, password, registration and setup screen: the site name leading
   * home, one titled card with its secondary links, and the privacy policy.
   */
  let {
    title,
    description,
    siteTitle,
    privacyPolicy,
    links = [],
    children,
  }: {
    title: string;
    description?: string;
    /** Absent before installation, when there is no site to go back to. */
    siteTitle?: string | null;
    privacyPolicy?: { title: string; path: string } | null;
    /** Site paths, resolved here. */
    links?: { href: Path; label: string }[];
    children: Snippet;
  } = $props();

  const i18n = useI18n();
  // Sign-in screens keep their messages in the card, outside any site toaster.
  provideToasts(false);
  let shell = $state<HTMLElement>();

  // Every sign-in screen follows the device, whatever the page around it (a public theme, or
  // the admin color mode); the inline script below applies it before the first paint.
  $effect(() => {
    const query = matchMedia(DARK_QUERY);
    const sync = () => shell?.classList.toggle('dark', query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });
</script>

<!-- `cms-auth` restores the admin tokens, so a public theme never restyles these screens. -->
<main
  bind:this={shell}
  id="main"
  class="cms-auth flex flex-1 flex-col items-center justify-center gap-6 bg-[color-mix(in_oklch,var(--muted)_40%,var(--background))] px-4 py-10 font-sans text-base text-foreground sm:py-16"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- fixed script; only the constant media query -->
  {@html `<script>document.currentScript.parentElement.classList.toggle('dark',matchMedia('${DARK_QUERY}').matches)</script>`}
  {#if siteTitle}
    <a
      href={resolve('/(site)')}
      class="max-w-full truncate rounded-sm text-lg font-semibold tracking-tight text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >{siteTitle}</a
    >
  {/if}
  <Card class="w-full max-w-md">
    <CardHeader>
      <h1 class="text-xl leading-tight font-semibold">{title}</h1>
      {#if description}<CardDescription>{description}</CardDescription>{/if}
    </CardHeader>
    <CardContent class="grid gap-4">
      {@render children()}
    </CardContent>
    {#if links.length}
      <CardFooter class="border-t">
        <nav
          aria-label={authMessages(i18n.language).links}
          class="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm"
        >
          {#each links as link (link.href)}
            <a
              href={resolve(link.href)}
              class="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >{link.label}</a
            >
          {/each}
        </nav>
      </CardFooter>
    {/if}
  </Card>
  {#if privacyPolicy}
    <footer><PrivacyPolicyLink policy={privacyPolicy} /></footer>
  {/if}
</main>
