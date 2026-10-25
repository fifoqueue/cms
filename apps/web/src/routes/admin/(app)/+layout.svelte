<script lang="ts">
  import { resolve } from '$app/paths';
  import { afterNavigate } from '$app/navigation';
  import { default as ExternalLink } from '@lucide/svelte/icons/external-link';
  import { default as LogOut } from '@lucide/svelte/icons/log-out';
  import { default as Menu } from '@lucide/svelte/icons/menu';
  import { default as PanelLeftClose } from '@lucide/svelte/icons/panel-left-close';
  import { default as PanelLeftOpen } from '@lucide/svelte/icons/panel-left-open';
  import { default as X } from '@lucide/svelte/icons/x';
  import { onMount } from 'svelte';
  import AdminMenu from '#lib/admin/AdminMenu.svelte';
  import AdminTopBar from '#lib/admin/AdminTopBar.svelte';
  import FlashNotice from '#lib/admin/FlashNotice.svelte';
  import { claimBackups } from '#lib/admin/editor-backup.js';
  import ColorModeToggle from '#lib/admin/ColorModeToggle.svelte';
  import Toasts from '#lib/components/Toasts.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { provideI18n } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const i18n = provideI18n(() => data.language);

  /** The small-screen menu panel. */
  let expanded = $state(false);
  let menuToggle: HTMLButtonElement | null = $state(null);

  afterNavigate(() => {
    expanded = false;
  });

  // Another account's editor backups never reach this one (a shared browser tab).
  $effect(() => claimBackups(data.user.id));

  // Icons-only sidebar on wide screens, remembered by this browser.
  const COLLAPSED = 'cms-admin-collapsed';
  let collapsed = $state(false);
  onMount(() => {
    try {
      collapsed = localStorage.getItem(COLLAPSED) === '1';
    } catch {
      // Storage blocked: the full menu shows.
    }
  });
  const toggleCollapsed = () => {
    collapsed = !collapsed;
    try {
      localStorage.setItem(COLLAPSED, collapsed ? '1' : '0');
    } catch {
      // Only this page view remembers it.
    }
  };
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key !== 'Escape' || !expanded) return;
    expanded = false;
    menuToggle?.focus();
  }}
/>

<!-- Above the editor's mobile save bar while it shows (`--cms-save-bar-offset`). -->
<Toasts theme={data.colorMode} lift="var(--cms-save-bar-offset, 0px)">
  <div
    class="flex min-h-screen flex-col bg-muted/40 md:flex-row"
    lang={i18n.language}
  >
    <a
      href="#admin-main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:text-foreground focus:outline-2 focus:outline-ring"
      >{i18n.m.skipToContent}</a
    >
    <aside
      class={[
        'border-b bg-background md:shrink-0 md:border-r md:border-b-0',
        collapsed ? 'collapsed md:w-14' : 'md:w-56',
      ]}
    >
      <div class="flex items-center justify-between gap-2 px-4 py-3 md:block">
        <div class="sidebar-label">
          <a href={resolve('/admin/(app)')} class="font-semibold">CMS</a>
          <a
            href={resolve('/admin/(app)/account')}
            class="hidden truncate text-sm text-muted-foreground hover:text-foreground md:mt-1 md:block"
            >{data.user.name}</a
          >
        </div>
        <Button
          bind:ref={menuToggle}
          variant="ghost"
          size="icon"
          class="md:hidden"
          aria-expanded={expanded}
          aria-controls="admin-menu"
          onclick={() => (expanded = !expanded)}
        >
          {#if expanded}<X />{:else}<Menu />{/if}
          <span class="sr-only">{i18n.m.navMenu}</span>
        </Button>
      </div>
      <div
        id="admin-menu"
        class={[
          'flex-col gap-4 px-2 pb-3 md:flex',
          expanded ? 'flex' : 'hidden',
        ]}
      >
        <nav aria-label={i18n.m.navMenu}>
          <AdminMenu
            user={data.user}
            pluginPages={data.pluginPages}
            types={data.types}
            taxonomies={data.taxonomies}
            counts={data.counts}
          />
        </nav>
        <div class="space-y-1 border-t pt-3">
          <a
            href={resolve('/(site)')}
            class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            <ExternalLink class="size-4" />
            {i18n.m.viewSite}
          </a>
          <form method="POST" action="/admin/logout">
            <Button
              type="submit"
              variant="ghost"
              class="w-full justify-start gap-2 px-3 font-normal text-foreground/80"
            >
              <LogOut class="size-4" />
              {i18n.m.signOut}
            </Button>
          </form>
          <div class="sidebar-label px-3 pt-1">
            <ColorModeToggle mode={data.colorMode} />
          </div>
          <Button
            variant="ghost"
            class="hidden w-full justify-start gap-2 px-3 font-normal text-foreground/80 md:flex"
            aria-pressed={collapsed}
            onclick={toggleCollapsed}
          >
            {#if collapsed}<PanelLeftOpen
                class="size-4"
              />{:else}<PanelLeftClose class="size-4" />{/if}
            {collapsed ? i18n.m.expandMenu : i18n.m.collapseMenu}
          </Button>
        </div>
      </div>
    </aside>
    <div class="min-w-0 flex-1">
      <AdminTopBar
        user={data.user}
        siteTitle={data.siteTitle}
        pendingComments={data.counts.comments}
      />
      <main id="admin-main" tabindex="-1" class="p-4 md:p-8">
        <div class="mx-auto max-w-5xl space-y-6">
          <FlashNotice />
          {@render children()}
        </div>
      </main>
    </div>
  </div>
</Toasts>

<style>
  /* Collapsed (wide screens): section links keep their icon and accessible name only. */
  @media (min-width: 48rem) {
    .collapsed :global(:is([data-section-link], a, button)) {
      font-size: 0;
      justify-content: center;
    }
    .collapsed
      :global(:is(.sidebar-label, nav ul ul:not([class*='absolute']))) {
      display: none;
    }
    /* Hover menus keep readable text. */
    .collapsed :global(nav ul ul a) {
      font-size: 0.875rem;
      justify-content: flex-start;
    }
  }
</style>
