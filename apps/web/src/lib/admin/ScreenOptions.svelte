<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Settings2 } from '@lucide/svelte';
  import { SCREEN_COOKIE } from '#lib/admin/screen-options.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    screen,
    columns = [],
    hidden,
    perPage,
  }: {
    /** Cookie key of this list. */
    screen: string;
    /** Columns the viewer may hide, with their labels. */
    columns?: readonly { key: string; label: string }[];
    hidden: readonly string[];
    perPage: number;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $derived(`screen-${screen}`);

  /** Saves for a year in this browser and reloads the list with the new settings. */
  const apply = async (event: SubmitEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const value = JSON.stringify({
      perPage: Number(form.get('perPage')),
      hidden: columns
        .map(({ key }) => key)
        .filter((key) => !form.getAll('shown').includes(key)),
    });
    document.cookie = `${SCREEN_COOKIE(screen)}=${encodeURIComponent(value)}; path=/admin; max-age=31536000; samesite=lax`;
    await invalidateAll();
  };
</script>

<details class="group rounded-md border bg-background text-sm">
  <summary
    class="flex cursor-pointer items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground"
  >
    <Settings2 class="size-4" />
    {m.screenOptions}
  </summary>
  <form onsubmit={apply} class="grid gap-4 border-t p-3">
    {#if columns.length}
      <fieldset class="flex flex-wrap gap-x-4 gap-y-2">
        <legend class="mb-2 font-medium">{m.screenColumns}</legend>
        {#each columns as column (column.key)}
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              name="shown"
              value={column.key}
              checked={!hidden.includes(column.key)}
            />
            {column.label}
          </label>
        {/each}
      </fieldset>
    {/if}
    <div class="flex flex-wrap items-end gap-3">
      <div class="grid gap-1">
        <Label for="{id}-per-page">{m.screenPerPage}</Label>
        <Input
          id="{id}-per-page"
          name="perPage"
          type="number"
          min={1}
          max={100}
          required
          value={perPage}
          class="w-24"
        />
      </div>
      <Button type="submit" size="sm">{m.apply}</Button>
    </div>
  </form>
</details>
