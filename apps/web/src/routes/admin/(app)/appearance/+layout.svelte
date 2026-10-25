<script lang="ts">
  import { page } from '$app/state';
  import { appearanceTabs } from '#lib/admin/admin-nav.js';
  import SectionTabs from '#lib/admin/SectionTabs.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const i18n = useI18n();

  /** The same screens as the Appearance menu (`admin-nav.ts`). */
  const tabs = appearanceTabs();
</script>

<SectionTabs
  label={i18n.m.navAppearance}
  tabs={tabs.map((tab) => ({
    href: tab.href,
    label: tab.label(i18n.m),
    current: page.url.pathname === tab.href,
  }))}
/>

{@render children()}
