<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import type { DashboardPreferences } from '@cms/sdk';
  import { ArrowDown, ArrowUp, Settings2 } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    widgets,
    preferences,
    form,
  }: {
    /** Every box this user can have, in the current order. */
    widgets: { id: string; title: string }[];
    preferences: DashboardPreferences;
    form?: {
      notice?: string;
      message?: string;
      code?: string;
      issues?: unknown;
    } | null;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  let order = $state(untrack(() => widgets.map(({ id }) => id)));
  const titles = $derived(new Map(widgets.map((w) => [w.id, w.title])));
  const choices = $derived([
    ...order.filter((id) => titles.has(id)),
    ...widgets.map(({ id }) => id).filter((id) => !order.includes(id)),
  ]);
  // Keep choices for temporarily unavailable boxes (empty comments, disabled plugins).
  const unavailable = $derived(
    [...new Set([...preferences.order, ...preferences.hidden])].filter(
      (id) => !titles.has(id),
    ),
  );
  const savedOrder = $derived.by(() => {
    let index = 0;
    const placed = [...new Set(preferences.order)]
      .map((id) => (unavailable.includes(id) ? id : choices[index++]))
      .filter((id): id is string => id !== undefined);
    return [...new Set([...placed, ...choices.slice(index), ...unavailable])];
  });
  let saving = $state(false);
  let failed = $state(false);

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= choices.length) return;
    const next = [...choices];
    [next[index], next[target]] = [next[target]!, next[index]!];
    order = next;
  };

  const save: SubmitFunction = () => {
    saving = true;
    failed = false;
    return async ({ result, update }) => {
      try {
        if (result.type === 'error') failed = true;
        else await update({ reset: false });
      } catch {
        failed = true;
      } finally {
        saving = false;
      }
    };
  };
</script>

<details
  open={!!form || failed}
  class="rounded-md border bg-background text-sm"
>
  <summary
    class="flex cursor-pointer items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground"
  >
    <Settings2 class="size-4" />
    {m.screenOptions}
  </summary>
  <form
    method="POST"
    action="?/preferences"
    use:enhance={save}
    class="grid gap-3 border-t p-3"
    aria-busy={saving}
  >
    {#if failed}
      <p role="alert" class="text-destructive">{m.dashboardSaveFailed}</p>
    {:else}
      <FormMessage {form} />
    {/if}
    {#each savedOrder as id (id)}
      <input type="hidden" name="order" value={id} />
    {/each}
    {#each unavailable as id (id)}
      {#if !preferences.hidden.includes(id)}
        <input type="hidden" name="shown" value={id} />
      {/if}
    {/each}
    <fieldset disabled={saving} class="grid gap-3">
      <legend class="mb-3 font-medium">{m.dashboardBoxes}</legend>
      <ol class="grid gap-1">
        {#each choices as id, index (id)}
          <li class="flex items-center gap-2">
            <label class="flex flex-1 items-center gap-2">
              <input
                type="checkbox"
                name="shown"
                value={id}
                checked={!preferences.hidden.includes(id)}
              />
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
              disabled={index === choices.length - 1}
              onclick={() => move(index, 1)}
              ><ArrowDown class="size-4" /></Button
            >
          </li>
        {/each}
      </ol>
      <div><Button type="submit" size="sm">{m.save}</Button></div>
    </fieldset>
  </form>
</details>
