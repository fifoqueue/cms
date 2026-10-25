<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { default as Menu } from '@lucide/svelte/icons/menu';
  import { default as X } from '@lucide/svelte/icons/x';
  import type { Block } from '@cms/sdk';
  import { useI18n } from '#lib/i18n/index.js';
  import type { MenuItemView } from '#lib/server/public-view.js';
  import NavigationItems from '#lib/theme/blocks/NavigationItems.svelte';
  import SchemeToggle from '#lib/theme/blocks/SchemeToggle.svelte';
  import { modal } from '#lib/theme/modal.js';
  import { useScope } from '#lib/theme/scope.js';

  let { block }: { block: Extract<Block, { name: 'navigation' }> } = $props();

  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const a = $derived(block.attrs);

  /** The menu at this location; without a primary menu, the published pages (as before menus). */
  const items = $derived.by((): MenuItemView[] => {
    const menu = scope().menus[a.location];
    if (menu) return menu;
    return a.location === 'primary'
      ? scope().pages.map((page) => ({
          label: page.title,
          url: page.path,
          newTab: false,
          children: [],
        }))
      : [];
  });
  const id = $props.id();
  let open = $state(false);
  let toggle = $state<HTMLButtonElement>();
  // The page changes without a reload, so the open menu must close itself.
  afterNavigate(() => {
    open = false;
  });
  // `modal` returns focus to the toggle when the panel goes away.
  const hide = () => {
    open = false;
  };

  const label = $derived(
    a.location === 'primary' ? m.primaryNavigation : m.footerNavigation,
  );
</script>

<!-- The menu belongs to small screens: once the theme hides the toggle (desktop width), it closes. -->
<svelte:window
  onresize={() => {
    if (open && toggle && !toggle.getClientRects().length) hide();
  }}
/>

{#if items.length}
  <nav aria-label={label} class="cms-block-navigation">
    {#if a.overlay && a.orientation === 'horizontal'}
      <div class="cms-navigation-bar hidden @min-[48rem]:block">
        <NavigationItems {items} orientation="horizontal" />
      </div>
      <!-- Small screens: a menu button and a panel that slides in from the start edge (an off-canvas menu). -->
      <button
        bind:this={toggle}
        type="button"
        class="cms-navigation-toggle flex size-9 shrink-0 items-center justify-center self-center rounded-full hover:bg-muted @min-[48rem]:hidden"
        aria-label={m.themeMenu}
        aria-expanded={open}
        aria-controls={id}
        onclick={() => (open = true)}
      >
        <Menu class="size-5" aria-hidden="true" />
      </button>
      {#if open}
        <div use:modal={{ close: hide }}>
          <button
            type="button"
            class="cms-offcanvas-backdrop fixed inset-0 z-50 cursor-default bg-black/30"
            tabindex="-1"
            aria-label={m.themeMenuClose}
            onclick={hide}
          ></button>
          <div
            {id}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            class="cms-offcanvas fixed top-[var(--cms-admin-bar,0px)] bottom-0 left-0 z-50 flex w-full flex-col bg-background text-foreground shadow-xl @min-[36rem]:w-[27rem] @min-[75rem]:w-[33.5rem]"
          >
            <div
              class="flex min-h-20 items-center justify-between gap-4 border-b pr-3 pl-6"
            >
              <p class="cms-block-site-title cms-heading truncate">
                {scope().site.title}
              </p>
              <button
                data-autofocus
                type="button"
                class="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                aria-label={m.themeMenuClose}
                onclick={hide}
              >
                <X class="size-6" aria-hidden="true" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-6">
              <NavigationItems {items} orientation="vertical" />
            </div>
            {#if scope().theme.settings.colorScheme.toggle}
              <div class="flex items-center border-t px-4 py-3">
                <SchemeToggle label />
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {:else}
      <NavigationItems {items} orientation={a.orientation} />
    {/if}
  </nav>
{/if}
