<script lang="ts">
  import { Menu, X } from '@lucide/svelte';
  import type { Block } from '@cms/sdk';
  import { useI18n } from '#lib/i18n/index.js';
  import type { MenuItemView } from '#lib/server/public-view.js';
  import NavigationItems from '#lib/theme/blocks/NavigationItems.svelte';
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
  const label = $derived(
    a.location === 'primary' ? m.primaryNavigation : m.footerNavigation,
  );
</script>

{#if items.length}
  <nav aria-label={label} class="cms-block-navigation">
    {#if a.overlay && a.orientation === 'horizontal'}
      <div class="hidden md:block">
        <NavigationItems {items} orientation="horizontal" />
      </div>
      <details class="group/menu relative md:hidden">
        <summary
          class="flex size-9 cursor-pointer list-none items-center justify-center rounded-full hover:bg-muted [&::-webkit-details-marker]:hidden"
          aria-label={m.themeMenu}
        >
          <Menu class="size-5 group-open/menu:hidden" />
          <X class="hidden size-5 group-open/menu:block" />
        </summary>
        <div
          class="absolute top-full right-0 z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-[var(--radius)] border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <NavigationItems {items} orientation="vertical" />
        </div>
      </details>
    {:else}
      <NavigationItems {items} orientation={a.orientation} />
    {/if}
  </nav>
{/if}
