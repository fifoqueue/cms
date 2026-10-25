<script lang="ts">
  import { enhance } from '$app/forms';
  import { default as LoaderCircle } from '@lucide/svelte/icons/loader-circle';
  import type { Snippet } from 'svelte';
  import {
    Button,
    type ButtonVariant,
  } from '#lib/components/ui/button/index.js';

  /**
   * A POSTed authentication form ending in its full-width submit button. The button stays
   * disabled while the attempt is on its way, so it (and its single-use captcha token) is sent
   * once.
   */
  let {
    action,
    submit,
    variant = 'default',
    enhanced = false,
    children,
  }: {
    action?: string;
    submit: string;
    variant?: ButtonVariant;
    /** Answer in place. Forms with a captcha reload instead, so the widget renders fresh. */
    enhanced?: boolean;
    children?: Snippet;
  } = $props();

  let pending = $state(false);

  const progressive = (form: HTMLFormElement) =>
    enhanced
      ? enhance(form, () => async ({ update }) => {
          try {
            await update();
          } finally {
            pending = false;
          }
        })
      : undefined;
</script>

<!-- A page restored from the back/forward cache must not keep a disabled button. -->
<svelte:window
  onpageshow={(event) => {
    if (event.persisted) pending = false;
  }}
/>

<form
  method="POST"
  {action}
  class="grid gap-4"
  aria-busy={pending}
  onsubmit={() => (pending = true)}
  use:progressive
>
  {@render children?.()}
  <Button type="submit" {variant} class="w-full" disabled={pending}>
    {#if pending}<LoaderCircle class="animate-spin" aria-hidden="true" />{/if}
    {submit}
  </Button>
</form>
