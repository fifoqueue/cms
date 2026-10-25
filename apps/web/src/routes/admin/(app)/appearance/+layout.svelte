<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import SectionTabs from '#lib/admin/SectionTabs.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const i18n = useI18n();

  const tabs = [
    {
      route: '/admin/(app)/appearance',
      label: (m: Messages) => m.appearanceThemes,
    },
    {
      route: '/admin/(app)/appearance/editor',
      label: (m: Messages) => m.navEditor,
    },
    {
      route: '/admin/(app)/appearance/menus',
      label: (m: Messages) => m.appearanceMenus,
    },
    {
      route: '/admin/(app)/appearance/widgets',
      label: (m: Messages) => m.appearanceWidgets,
    },
  ] as const;
</script>

<SectionTabs
  label={i18n.m.navAppearance}
  tabs={tabs.map((tab) => ({
    href: resolve(tab.route),
    label: tab.label(i18n.m),
    current: page.route.id === tab.route,
  }))}
/>

{@render children()}
