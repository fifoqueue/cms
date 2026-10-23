<script lang="ts">
  import { useI18n } from '#lib/i18n/index.js';

  /** The theme's screenshot, or a miniature of the public site drawn with its palette. */
  let {
    palette,
    name,
    screenshot = null,
  }: {
    palette: { slug: string; name: string; color: string }[];
    name: string;
    screenshot?: string | null;
  } = $props();

  const i18n = useI18n();
  const color = (slug: string) =>
    palette.find((entry) => entry.slug === slug)?.color ?? '#ffffff';
</script>

{#if screenshot}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin route address built by the server -->
  <img
    src={screenshot}
    alt=""
    loading="lazy"
    class="aspect-[4/3] w-full rounded-md border object-cover object-top"
  />
{:else}
  <div
    class="overflow-hidden rounded-md border"
    style:background-color={color('base')}
    style:color={color('contrast')}
    aria-hidden="true"
  >
    <div
      class="flex items-center justify-between border-b px-3 py-2"
      style:border-color={color('border')}
    >
      <span class="text-xs font-semibold">{name}</span>
      <span class="flex gap-1.5">
        <span
          class="h-1.5 w-6 rounded-full"
          style:background-color={color('muted')}
        ></span>
        <span
          class="h-1.5 w-6 rounded-full"
          style:background-color={color('muted')}
        ></span>
      </span>
    </div>
    <div class="space-y-2 p-3">
      {#each [0, 1] as item (item)}
        <div class="space-y-1">
          <div
            class="h-2 w-2/3 rounded-sm opacity-90"
            style:background-color={color('contrast')}
          ></div>
          <div
            class="h-1.5 w-full rounded-sm opacity-60"
            style:background-color={color('muted')}
          ></div>
          <div
            class="h-1.5 w-10 rounded-sm"
            style:background-color={color('accent')}
          ></div>
        </div>
      {/each}
    </div>
    <div class="h-3" style:background-color={color('surface')}></div>
  </div>
{/if}
<ul class="mt-3 flex flex-wrap gap-1.5" aria-label={i18n.m.themeColors}>
  {#each palette as entry (entry.slug)}
    <li>
      <span
        class="block size-4 rounded-full border border-black/10"
        style:background-color={entry.color}
        title="{entry.name}: {entry.color}"
      ></span>
      <span class="sr-only">{entry.name} {entry.color}</span>
    </li>
  {/each}
</ul>
