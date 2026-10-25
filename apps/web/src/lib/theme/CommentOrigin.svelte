<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { CommentOrigin } from '#lib/server/comments.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    /** The tooltip's element id. */
    id: string;
    origin: CommentOrigin;
    /** What the trigger shows (the comment's date). */
    children: Snippet;
  }

  let { id, origin, children }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let root = $state<HTMLElement>();
  /** Opened by a click or tap; hover and keyboard focus open it without this. */
  let pinned = $state(false);
  /** Escape hides it until the pointer or focus leaves. */
  let dismissed = $state(false);
  const reset = () => {
    pinned = false;
    dismissed = false;
  };
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key !== 'Escape') return;
    pinned = false;
    dismissed = true;
  }}
  onpointerdown={(event) => {
    if (pinned && !root?.contains(event.target as Node)) pinned = false;
  }}
/>

<!--
  The author's IP address and browser, for moderators: shown on hover, keyboard focus, or a
  click or tap. The tooltip spans the nearest positioned ancestor (the comment's author line), so
  it stays inside the column wherever the trigger sits.
-->
<span
  bind:this={root}
  class="group/origin"
  role="presentation"
  onpointerleave={() => (dismissed = false)}
>
  <button
    type="button"
    aria-describedby={id}
    class="cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    onclick={() => {
      pinned = !pinned;
      dismissed = false;
    }}
    onblur={reset}>{@render children()}</button
  >
  <span
    {id}
    role="tooltip"
    class={[
      'invisible absolute top-full left-0 z-20 block w-max max-w-[min(100%,28rem)] pt-1.5 opacity-0 transition-opacity',
      !dismissed &&
        'group-hover/origin:visible group-hover/origin:opacity-100 group-has-focus-visible/origin:visible group-has-focus-visible/origin:opacity-100',
      pinned && !dismissed && 'visible opacity-100',
    ]}
  >
    <span
      class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
    >
      {#if origin.ip}
        <span class="text-muted-foreground">{m.clientIp}</span>
        <span class="font-mono break-all">{origin.ip}</span>
      {/if}
      {#if origin.userAgent}
        <span class="text-muted-foreground">{m.clientUserAgent}</span>
        <span class="wrap-anywhere">{origin.userAgent}</span>
      {/if}
    </span>
  </span>
</span>
