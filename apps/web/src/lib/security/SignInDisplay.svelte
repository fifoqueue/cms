<script lang="ts">
  import CopyButton from '#lib/admin/CopyButton.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { DisplayView } from '#lib/server/sign-in-view.js';

  /** What a step shows besides its fields: text, a code to copy, or a QR code drawn on the server. */
  let { display }: { display: DisplayView[] } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

{#each display as item, index (index)}
  {#if item.kind === 'text'}
    <p class="text-sm whitespace-pre-line text-muted-foreground">{item.text}</p>
  {:else if item.kind === 'code'}
    <div class="flex flex-wrap items-center gap-2">
      <code
        class="rounded bg-muted px-2 py-1.5 font-mono text-sm break-all select-all"
        >{item.text}</code
      >
      <CopyButton text={item.text} label={m.signInCopyCode} />
    </div>
  {:else}
    <!-- Dark modules on white whatever the color mode, with the quiet zone scanners need. -->
    <svg
      role="img"
      aria-label={m.signInQrCode}
      viewBox="-4 -4 {item.qr.size + 8} {item.qr.size + 8}"
      class="mx-auto size-48 rounded-md bg-white"
      shape-rendering="crispEdges"
    >
      <path d={item.qr.path} fill="#000" />
    </svg>
  {/if}
{/each}
