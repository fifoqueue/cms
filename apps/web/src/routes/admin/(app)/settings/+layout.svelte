<script lang="ts">
  import { page } from '$app/state';
  import { allowedEntries, settingsTabs } from '#lib/admin/admin-nav.js';
  import SectionTabs from '#lib/admin/SectionTabs.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const i18n = useI18n();

  /** The same screens and order as the Settings menu (`admin-nav.ts`). */
  const tabs = $derived(allowedEntries(settingsTabs(), data.user));
</script>

<SectionTabs
  label={i18n.m.navSettings}
  tabs={tabs.map((tab) => ({
    href: tab.href,
    label: tab.label(i18n.m),
    current: page.url.pathname === tab.href,
  }))}
/>

{@render children()}
