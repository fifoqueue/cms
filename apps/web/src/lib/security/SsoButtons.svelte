<script lang="ts">
  import { default as LoaderCircle } from '@lucide/svelte/icons/loader-circle';
  import type { Snippet } from 'svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  /**
   * One POSTed form with a button per choice (a sign-in method's options, such as single
   * sign-on providers, or second factors); the chosen button sends its id as `name`. Works
   * without scripts; with them, the buttons stay disabled while the next page loads.
   */
  let {
    action,
    name,
    options,
    label = (text: string) => text,
    variant = 'outline',
    children,
  }: {
    action: string;
    name: string;
    options: { id: string; label: string }[];
    label?: (text: string) => string;
    variant?: 'outline' | 'default';
    /** Hidden fields sent with every button. */
    children?: Snippet;
  } = $props();

  let pending = $state<string | null>(null);

  const submitted = (event: SubmitEvent) => {
    const chosen =
      event.submitter instanceof HTMLButtonElement ? event.submitter.value : '';
    // Disabled only after the browser has read the chosen button's value.
    setTimeout(() => (pending = chosen));
  };
</script>

<!-- A page restored from the back/forward cache must not keep disabled buttons. -->
<svelte:window
  onpageshow={(event) => {
    if (event.persisted) pending = null;
  }}
/>

<form
  method="POST"
  {action}
  class="grid gap-2"
  aria-busy={pending !== null}
  onsubmit={submitted}
>
  {@render children?.()}
  {#each options as option (option.id)}
    <Button
      type="submit"
      {name}
      value={option.id}
      {variant}
      class="w-full"
      disabled={pending !== null}
    >
      {#if pending === option.id}<LoaderCircle
          class="animate-spin"
          aria-hidden="true"
        />{/if}
      {label(option.label)}
    </Button>
  {/each}
</form>
