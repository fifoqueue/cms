<script lang="ts">
  import Comments from '#lib/theme/Comments.svelte';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import { useCurrentPost, useScope } from '#lib/theme/scope.js';

  const current = useCurrentPost();
  const scope = useScope();
  const entry = $derived(current().entry);
  const comments = $derived(scope().comments);
  const slots = $derived(scope().slots);
</script>

{#if entry && comments && !entry.protected}
  <div class="cms-block-comments">
    <SlotOutlet fragments={slots?.['comments.before'] ?? []} />
    <Comments contentId={entry.id} {comments} moderation={scope().moderation} />
    <SlotOutlet fragments={slots?.['comments.after'] ?? []} />
  </div>
{/if}
