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
  tabs={[
    ...tabs.map((tab) => ({
      href: resolve(tab.route),
      label: tab.label(i18n.m),
      current: page.route.id === tab.route,
    })),
    // Privacy requests share one route; the action names the tab.
    ...(can(data.user, 'users.manage')
      ? (['export', 'erase'] as const).map((action) => ({
          href: resolve('/admin/(app)/tools/privacy/[action]', { action }),
          label:
            action === 'export' ? i18n.m.privacyExport : i18n.m.privacyErase,
          current:
            page.route.id === '/admin/(app)/tools/privacy/[action]' &&
            page.params.action === action,
        }))
      : []),
  ]}
/>

{@render children()}
