<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ArrowDown, ArrowUp, Settings2 } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { DASHBOARD_COOKIE } from '#lib/admin/screen-options.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    widgets,
    hidden,
  }: {
    /** Every box this user can have, in the current order. */
    widgets: { id: string; title: string }[];
    hidden: readonly string[];
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  // Edited locally; saving stores the layout in this browser and reloads the dashboard.
  let order = $state(untrack(() => widgets.map(({ id }) => id)));
  let shown = $state(
    untrack(() =>
      widgets.map(({ id }) => id).filter((id) => !hidden.includes(id)),
    ),
  );
  const titles = $derived(new Map(widgets.map((w) => [w.id, w.title])));

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    order = next;
  };

  const save = async () => {
    const value = JSON.stringify({
      order,
      hidden: order.filter((id) => !shown.includes(id)),
    });
    document.cookie = `${DASHBOARD_COOKIE}=${encodeURIComponent(value)}; path=/admin; max-age=31536000; samesite=lax`;
    await invalidateAll();
  };
</script>

<details class="rounded-md border bg-background text-sm">
  <summary
    class="flex cursor-pointer items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground"
  >
    <Settings2 class="size-4" />
    {m.screenOptions}
  </summary>
  <div class="grid gap-3 border-t p-3">
    <p class="font-medium">{m.dashboardBoxes}</p>
    <ol class="grid gap-1">
      {#each order as id, index (id)}
        <li class="flex items-center gap-2">
          <label class="flex flex-1 items-center gap-2">
            <input type="checkbox" value={id} bind:group={shown} />
            {titles.get(id) ?? id}
          </label>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={m.moveUpItem(titles.get(id) ?? id)}
            disabled={index === 0}
            onclick={() => move(index, -1)}><ArrowUp class="size-4" /></Button
          >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={m.moveDownItem(titles.get(id) ?? id)}
            disabled={index === order.length - 1}
            onclick={() => move(index, 1)}><ArrowDown class="size-4" /></Button
          >
        </li>
      {/each}
    </ol>
    <div><Button type="button" size="sm" onclick={save}>{m.save}</Button></div>
  </div>
</details>
