<script lang="ts">
  /** Section tabs; callers pass `href`s already built with `resolve()`. */
  let {
    label,
    tabs,
  }: {
    label: string;
    tabs: readonly { href: string; label: string; current: boolean }[];
  } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- every href comes from resolve() -->
<nav aria-label={label} class="flex flex-wrap gap-1 border-b">
  {#each tabs as tab (tab.href)}
    <a
      href={tab.href}
      aria-current={tab.current ? 'page' : undefined}
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
      >{tab.label}</a
    >
  {/each}
</nav>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
