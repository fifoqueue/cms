<script lang="ts">
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    ip: string | null;
    userAgent: string | null;
    /** Where the address leads (other activity from it); plain text without one. */
    ipHref?: string;
    /** Only the address, with the browser in its tooltip. */
    brief?: boolean;
  }

  let { ip, userAgent, ipHref, brief = false }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<!-- The IP address and browser a comment or an edit came from; the browser is cut to one line and shown whole on hover. -->
{#if ip || (!brief && userAgent)}
  <span
    class="flex max-w-full min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground"
  >
    {#if ip}
      {#if ipHref}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass a resolve() result -->
        <a
          href={ipHref}
          title={m.clientIp}
          class="font-mono break-all hover:underline"
          ><span class="sr-only">{m.clientIp}: </span>{ip}</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {:else}
        <span
          title={brief && userAgent ? userAgent : m.clientIp}
          class="font-mono break-all"
          ><span class="sr-only">{m.clientIp}: </span>{ip}</span
        >
      {/if}
    {/if}
    {#if userAgent && !brief}
      <span class="max-w-full min-w-0 truncate" title={userAgent}
        ><span class="sr-only">{m.clientUserAgent}: </span>{userAgent}</span
      >
    {/if}
  </span>
{/if}
