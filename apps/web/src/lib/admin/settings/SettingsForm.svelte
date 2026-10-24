<script lang="ts">
  import { enhance } from '$app/forms';
  import type { Snippet } from 'svelte';

  let {
    action,
    class: className,
    reset = false,
    children,
  }: {
    action?: string;
    class?: string;
    reset?: boolean;
    children: Snippet;
  } = $props();
</script>

<form
  method="POST"
  {action}
  class={className}
  use:enhance={() =>
    ({ update }) =>
      update({ reset })}
>
  {@render children()}
</form>
