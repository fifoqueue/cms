<script lang="ts">
  import type { BlockName } from '@cms/sdk';
  import { BLOCK_NAMES } from '@cms/sdk';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  /** Searchable list of theme blocks; `allowed` limits it to what fits where it inserts. */
  let {
    allowed = BLOCK_NAMES,
    onpick,
  }: { allowed?: readonly BlockName[]; onpick: (name: BlockName) => void } =
    $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let search = $state('');
  const shown = $derived(
    allowed.filter((name) =>
      `${m.blockName(name)} ${name}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
  );
</script>

<div class="space-y-2">
  <Input
    type="search"
    placeholder={m.editorSearchBlocks}
    aria-label={m.editorSearchBlocks}
    bind:value={search}
    class="h-8"
    onkeydown={(event) => {
      // The inserter sits inside the template's save form: Enter inserts, never saves.
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (shown[0]) onpick(shown[0]);
    }}
  />
  <ul class="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
    {#each shown as name (name)}
      <li>
        <button
          type="button"
          class="w-full rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onclick={() => onpick(name)}>{m.blockName(name)}</button
        >
      </li>
    {:else}
      <li class="col-span-2 text-xs text-muted-foreground">
        {m.editorNoMatchingBlocks}
      </li>
    {/each}
  </ul>
</div>
