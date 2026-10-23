<script lang="ts">
  import { can } from '@cms/sdk/capabilities';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
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

<nav aria-label={i18n.m.navTools} class="flex flex-wrap gap-1 border-b">
  {#each tabs as tab (tab.route)}
    <a
      href={resolve(tab.route)}
      aria-current={page.route.id === tab.route ? 'page' : undefined}
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
      >{tab.label(i18n.m)}</a
    >
  {/each}
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
</nav>

{@render children()}
