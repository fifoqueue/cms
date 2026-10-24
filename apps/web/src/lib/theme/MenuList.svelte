<script lang="ts">
  import type { MenuItemView } from '#lib/server/public-view.js';
  import { hrefOptions } from '#lib/route-link.js';
  import MenuList from '#lib/theme/MenuList.svelte';

  interface Props {
    items: MenuItemView[];
    /** `bar` lays the top level out in a row with submenus on hover or focus. */
    layout?: 'bar' | 'list';
  }

  let { items, layout = 'list' }: Props = $props();
</script>

<ul
  class={layout === 'bar'
    ? 'flex flex-wrap gap-4 text-sm text-muted-foreground'
    : 'space-y-1 text-sm'}
>
  {#each items as item, index (index)}
    <li class={layout === 'bar' ? 'group relative' : ''}>
      <!-- eslint-disable svelte/no-navigation-without-resolve -- menu links are site paths or external addresses chosen by admins -->
      <a
        href={item.url}
        {...hrefOptions(item.url)}
        target={item.newTab ? '_blank' : undefined}
        rel={item.newTab ? 'noopener' : undefined}
        class="hover:text-foreground hover:underline">{item.label}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {#if item.children.length}
        <div
          class={layout === 'bar'
            ? 'invisible absolute top-full left-0 z-10 min-w-48 rounded-md border bg-card p-3 opacity-0 shadow-sm group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'
            : 'mt-1 ml-4'}
        >
          <MenuList items={item.children} />
        </div>
      {/if}
    </li>
  {/each}
</ul>
