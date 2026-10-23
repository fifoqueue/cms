<script lang="ts">
  import type { Block } from '@cms/sdk';
  import { useI18n } from '#lib/i18n/index.js';
  import { linkOptions } from '#lib/route-link.js';
  import { useScope } from '#lib/theme/scope.js';

  /** Profile links named by their service; links without an address are left out. */
  let { block }: { block: Extract<Block, { name: 'social-links' }> } = $props();

  const i18n = useI18n();
  const scope = useScope();
  const m = $derived(i18n.m);
  const JUSTIFY = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
  } as const;
  /** Brand names are not translated. */
  const BRANDS: Record<string, string> = {
    facebook: 'Facebook',
    x: 'X',
    instagram: 'Instagram',
    threads: 'Threads',
    bluesky: 'Bluesky',
    mastodon: 'Mastodon',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    github: 'GitHub',
    rss: 'RSS',
  };
  const name = (service: string) =>
    service === 'email'
      ? m.themeSocialEmail
      : service === 'link'
        ? m.themeSocialWebsite
        : (BRANDS[service] ?? service);
</script>

<ul
  class="cms-block-social-links flex flex-wrap gap-2 text-sm {JUSTIFY[
    block.attrs.justify
  ]}"
>
  {#each block.children as link, index (index)}
    {#if link.name === 'social-link' && link.attrs.url}
      <li>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- external profile addresses chosen by admins -->
        <a
          href={link.attrs.url}
          {...linkOptions(scope().linkRoutes[link.attrs.url])}
          rel="me noopener"
          class="cms-block-social-link inline-flex rounded-full border px-3 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >{link.attrs.label || name(link.attrs.service)}</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </li>
    {/if}
  {/each}
</ul>
