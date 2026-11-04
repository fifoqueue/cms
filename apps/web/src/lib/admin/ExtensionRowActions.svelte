<script lang="ts">
  import { enhance } from '$app/forms';

  let {
    actions,
    id,
  }: {
    /** Registered row actions of the screen, already checked for this user by the API. */
    actions: readonly { key: string; label: string }[];
    id: string;
  } = $props();
</script>

{#each actions as action (action.key)}
  <form method="POST" action="?/extension" use:enhance>
    <input type="hidden" name="action" value={action.key} />
    <input type="hidden" name="ids" value={id} />
    <button type="submit" class="cursor-pointer text-primary hover:underline"
      >{action.label}</button
    >
  </form>
{/each}
