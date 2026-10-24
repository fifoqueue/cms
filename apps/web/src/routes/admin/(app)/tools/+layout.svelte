<script lang="ts">
  import { can } from '@cms/sdk/capabilities';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import SectionTabs from '#lib/admin/SectionTabs.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const i18n = useI18n();

  const tabs = [
    {
      route: '/admin/(app)/tools/health',
      label: (m: Messages) => m.toolsHealth,
    },
    {
      route: '/admin/(app)/tools/transfer',
      label: (m: Messages) => m.toolsTransfer,
    },
    {
      route: '/admin/(app)/tools/webhooks',
      label: (m: Messages) => m.toolsWebhooks,
    },
  ] as const;
</script>

<SectionTabs
  label={i18n.m.navTools}
  tabs={tabs.map((tab) => ({
    route: tab.route,
    label: tab.label(i18n.m),
    current: page.route.id === tab.route,
  }))}
>
  {#if can(data.user, 'users.manage')}
    <a
      class="px-3 py-2 text-sm"
      href={resolve('/admin/(app)/tools/privacy/[action]', {
        action: 'export',
      })}>{i18n.m.privacyExport}</a
    >
    <a
      class="px-3 py-2 text-sm"
      href={resolve('/admin/(app)/tools/privacy/[action]', { action: 'erase' })}
      >{i18n.m.privacyErase}</a
    >
  {/if}
</SectionTabs>

{@render children()}
