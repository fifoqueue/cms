<script lang="ts">
  import { catalogMessage } from '#lib/admin/form-errors.js';
  import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
  import { announceBulk } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    result,
    names,
  }: {
    /** A bulk action's outcome; nothing is shown without one. */
    result: {
      done: number;
      failed: {
        id: string;
        message: string;
        params?: Record<string, string | number>;
      }[];
    } | null;
    /** Display names by id, for the items that failed. */
    names: ReadonlyMap<string, string>;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  // The counts are a toast; the items that failed stay listed here, with their reasons.
  $effect(() => {
    if (result) announceBulk(m, result);
  });
</script>

{#if result?.failed.length}
  <Alert variant="destructive">
    <AlertDescription>
      <ul class="list-disc pl-4">
        {#each result.failed as failure (failure.id)}
          <li>
            {names.get(failure.id) ?? failure.id}: {catalogMessage(
              m,
              failure.message,
              failure.params,
            ) ?? (i18n.language === 'en' ? failure.message : m.errorGeneric)}
          </li>
        {/each}
      </ul>
    </AlertDescription>
  </Alert>
{/if}
