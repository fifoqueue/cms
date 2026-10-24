<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';

  type SectionRoute =
    | '/admin/(app)/appearance'
    | '/admin/(app)/appearance/editor'
    | '/admin/(app)/appearance/menus'
    | '/admin/(app)/appearance/widgets'
    | '/admin/(app)/tools/health'
    | '/admin/(app)/tools/transfer'
    | '/admin/(app)/tools/webhooks';

  let {
    label,
    tabs,
    children,
  }: {
    label: string;
    tabs: readonly { route: SectionRoute; label: string; current: boolean }[];
    children?: Snippet;
  } = $props();
</script>

<nav aria-label={label} class="flex flex-wrap gap-1 border-b">
  {#each tabs as tab (tab.route)}
    <a
      href={resolve(tab.route)}
      aria-current={tab.current ? 'page' : undefined}
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
      >{tab.label}</a
    >
  {/each}
  {@render children?.()}
</nav>
