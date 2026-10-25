<script lang="ts">
  import { enhance } from '$app/forms';
  import type { Snippet } from 'svelte';

  let {
    action,
    class: className,
    reset = false,
    novalidate = false,
    children,
  }: {
    action?: string;
    class?: string;
    reset?: boolean;
    /** Skip the browser's checks when the server validates (and some fields may be hidden). */
    novalidate?: boolean;
    children: Snippet;
  } = $props();
</script>

<form
  method="POST"
  {action}
  {novalidate}
  class={className}
  use:enhance={() =>
    ({ update }) =>
      update({ reset })}
>
  {@render children()}
</form>
