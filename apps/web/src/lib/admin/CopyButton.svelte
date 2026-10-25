<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  /** Copies `text` to the clipboard. It needs scripts, so it appears once they run. */
  let { text, label }: { text: string; label: string } = $props();

  const i18n = useI18n();
  let ready = $state(false);
  let outcome = $state<'idle' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    ready = true;
    return () => clearTimeout(timer);
  });

  const copy = async () => {
    outcome = await navigator.clipboard.writeText(text).then(
      () => 'copied' as const,
      () => 'failed' as const,
    );
    clearTimeout(timer);
    timer = setTimeout(() => (outcome = 'idle'), 2000);
  };
</script>

{#if ready}
  <Button type="button" variant="outline" size="sm" onclick={copy}>
    {outcome === 'copied' ? i18n.m.copied : label}
  </Button>
  {#if outcome === 'failed'}
    <span role="alert" class="text-xs text-destructive"
      >{i18n.m.copyFailed}</span
    >
  {/if}
{/if}
