<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { useI18n } from '#lib/i18n/index.js';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import { useCurrentPost, useScope } from '#lib/theme/scope.js';

  const current = useCurrentPost();
  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const entry = $derived(current().entry);
  const post = $derived(current().post);
  const slots = $derived(scope().slots);
  const failure = $derived(
    page.form && 'message' in page.form ? String(page.form.message) : '',
  );
</script>

{#if entry}
  <div class="cms-block-post-content">
    <SlotOutlet fragments={slots?.['content.before'] ?? []} />
    {#if entry.protected}
      <form
        method="POST"
        action="?/unlock"
        use:enhance
        class="space-y-3 rounded-[var(--radius)] border bg-card p-6"
      >
        <p class="font-medium">{m.protectedTitle}</p>
        <p class="text-sm text-muted-foreground">{m.protectedHelp}</p>
        <input type="hidden" name="id" value={entry.id} />
        <div class="flex flex-wrap gap-2">
          <label class="sr-only" for="content-password">{m.password}</label>
          <input
            id="content-password"
            name="password"
            type="password"
            required
            autocomplete="off"
            class="h-10 rounded-[var(--radius)] border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            class="h-10 rounded-[var(--radius)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >{m.unlock}</button
          >
        </div>
        {#if failure}<p class="text-sm text-destructive" role="alert">
            {failure}
          </p>{/if}
      </form>
    {:else}
      <div class="cms-prose prose max-w-none">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered by the API from a schema-validated document -->
        {@html entry.html}
      </div>
    {/if}
    <SlotOutlet fragments={slots?.['content.after'] ?? []} />
  </div>
{:else if post?.excerpt}
  <p class="cms-block-post-content text-muted-foreground">{post.excerpt}</p>
{/if}
