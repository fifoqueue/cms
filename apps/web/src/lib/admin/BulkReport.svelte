<script lang="ts">
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '#lib/components/ui/alert/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    result,
    names,
  }: {
    /** A bulk action's outcome; nothing is shown without one. */
    result: { done: number; failed: { id: string; message: string }[] } | null;
    /** Display names by id, for the items that failed. */
    names: ReadonlyMap<string, string>;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

{#if result}
  <Alert variant={result.failed.length ? 'destructive' : 'default'}>
    <AlertTitle>
      {m.bulkDone(result.done)}
      {#if result.failed.length}· {m.bulkFailed(result.failed.length)}{/if}
    </AlertTitle>
    {#if result.failed.length}
      <AlertDescription>
        <ul class="list-disc pl-4">
          {#each result.failed as failure (failure.id)}
            <li>{names.get(failure.id) ?? failure.id}: {failure.message}</li>
          {/each}
        </ul>
      </AlertDescription>
    {/if}
  </Alert>
{/if}
