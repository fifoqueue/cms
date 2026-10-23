<script lang="ts">
  import { page } from '$app/state';
  import { X } from '@lucide/svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  // A notice that survives a redirect travels as `?notice=<catalog key>`; `undo` names the
  // trashed entry to restore. Unknown keys show nothing, so the address cannot inject text.
  const i18n = useI18n();
  const text = $derived.by(() => {
    const key = page.url.searchParams.get('notice');
    const value = key && (i18n.m as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  });
  const undo = $derived(page.url.searchParams.get('undo'));
  let dismissed = $state('');
</script>

{#if text && dismissed !== page.url.href}
  <Alert class="relative pr-10" role="status">
    <AlertTitle class="flex flex-wrap items-center gap-2">
      {text}
      {#if undo}
        <form
          method="POST"
          action="/admin/content/{encodeURIComponent(undo)}?/restore"
        >
          <button type="submit" class="underline">{i18n.m.undo}</button>
        </form>
      {/if}
    </AlertTitle>
    <button
      type="button"
      class="absolute top-2 right-2 rounded p-1 hover:bg-muted"
      aria-label={i18n.m.dismiss}
      onclick={() => (dismissed = page.url.href)}><X class="size-4" /></button
    >
  </Alert>
{/if}
