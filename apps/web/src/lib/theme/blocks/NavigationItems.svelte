<script lang="ts">
  import { page } from '$app/state';
  import { ChevronDown } from '@lucide/svelte';
  import type { MenuItemView } from '#lib/server/public-view.js';
  import { hrefOptions } from '#lib/route-link.js';
  import NavigationItems from '#lib/theme/blocks/NavigationItems.svelte';

  interface Props {
    items: MenuItemView[];
    /** Horizontal top levels open their submenus as a popup on hover or keyboard focus. */
    orientation: 'horizontal' | 'vertical';
    nested?: boolean;
  }

  let { items, orientation, nested = false }: Props = $props();
</script>

<ul
  class={orientation === 'horizontal' && !nested
    ? 'flex flex-wrap items-center gap-1 text-sm'
    : nested && orientation === 'vertical'
      ? 'mt-1 ml-3 space-y-0.5 border-l pl-3 text-sm'
      : 'space-y-0.5 text-sm'}
>
  {#each items as item, index (index)}
    <li
      class={orientation === 'vertical'
        ? ''
        : nested
          ? 'group/sub relative'
          : 'group/item relative'}
    >
      <!-- eslint-disable svelte/no-navigation-without-resolve -- menu links are site paths or external addresses chosen by admins -->
      <a
        href={item.url}
        {...hrefOptions(item.url)}
        target={item.newTab ? '_blank' : undefined}
        rel={item.newTab ? 'noopener' : undefined}
        aria-current={item.url === page.url.pathname ? 'page' : undefined}
        aria-haspopup={orientation === 'horizontal' && item.children.length
          ? 'true'
          : undefined}
        class="flex items-center gap-1 rounded-[calc(var(--radius)*0.75)] px-3 py-2 text-muted-foreground transition hover:bg-muted hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground {orientation ===
          'horizontal' && nested
          ? 'justify-between'
          : ''}"
        >{item.label}{#if orientation === 'horizontal' && item.children.length}<ChevronDown
            class="size-3.5 opacity-60 transition {nested
              ? '-rotate-90'
              : 'group-hover/item:rotate-180'}"
          />{/if}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {#if item.children.length}
        {#if orientation === 'horizontal'}
          <div
            class="invisible absolute z-40 min-w-52 opacity-0 transition duration-150 {nested
              ? 'top-0 left-full translate-x-1 pl-1 group-focus-within/sub:visible group-focus-within/sub:translate-x-0 group-focus-within/sub:opacity-100 group-hover/sub:visible group-hover/sub:translate-x-0 group-hover/sub:opacity-100'
              : 'top-full left-0 translate-y-1 pt-1 group-focus-within/item:visible group-focus-within/item:translate-y-0 group-focus-within/item:opacity-100 group-hover/item:visible group-hover/item:translate-y-0 group-hover/item:opacity-100'}"
          >
            <div
              class="rounded-[var(--radius)] border bg-popover p-1.5 text-popover-foreground shadow-lg"
            >
              <NavigationItems
                items={item.children}
                orientation="horizontal"
                nested
              />
            </div>
          </div>
        {:else}
          <NavigationItems
            items={item.children}
            orientation="vertical"
            nested
          />
        {/if}
      {/if}
    </li>
  {/each}
</ul>
