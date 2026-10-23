<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const i18n = useI18n();

  /** wp-admin's order first, then this CMS's own screens (the same order as the menu). */
  const tabs = [
    {
      route: '/admin/(app)/settings/privacy',
      label: (m: Messages) => m.privacySettings,
    },
    {
      route: '/admin/(app)/settings',
      label: (m: Messages) => m.settingsGeneral,
    },
    {
      route: '/admin/(app)/settings/reading',
      label: (m: Messages) => m.settingsReading,
    },
    {
      route: '/admin/(app)/settings/discussion',
      label: (m: Messages) => m.settingsDiscussion,
    },
    {
      route: '/admin/(app)/settings/permalinks',
      label: (m: Messages) => m.permalinksTitle,
    },
    {
      route: '/admin/(app)/settings/email',
      label: (m: Messages) => m.settingsEmail,
    },
    {
      route: '/admin/(app)/settings/search',
      label: (m: Messages) => m.settingsSearch,
    },
    {
      route: '/admin/(app)/settings/security',
      label: (m: Messages) => m.settingsSecurity,
    },
    {
      route: '/admin/(app)/settings/sso',
      label: (m: Messages) => m.settingsSso,
    },
  ] as const;
</script>

<nav aria-label={i18n.m.navSettings} class="flex flex-wrap gap-1 border-b">
  {#each tabs as tab (tab.route)}
    <a
      href={resolve(tab.route)}
      aria-current={page.route.id === tab.route ? 'page' : undefined}
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
      >{tab.label(i18n.m)}</a
    >
  {/each}
</nav>

{@render children()}
