<script lang="ts">
  import type { Path } from '$app/types';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { useI18n } from '#lib/i18n/index.js';
  import SlotOutlet from '#lib/theme/SlotOutlet.svelte';
  import { codeCopy } from '#lib/theme/content/code-copy.js';
  import { enhanceToc } from '#lib/theme/content/toc.js';
  import '#lib/theme/content/code-block.css';
  import CalloutDismissal from '#lib/theme/content/CalloutDismissal.svelte';
  import { useCurrentPost, useScope } from '#lib/theme/scope.js';

  const current = useCurrentPost();
  const scope = useScope();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const entry = $derived(current().entry);
  const post = $derived(current().post);
  const slots = $derived(scope().slots);
  let prose = $state<HTMLElement>();
  const failure = $derived(
    page.form && 'message' in page.form ? String(page.form.message) : '',
  );
</script>

{#if entry}
  <div class="cms-block-post-content" data-entry-body>
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
      <div
        class="cms-prose prose max-w-none"
        use:codeCopy={{
          copy: m.contentCodeCopy,
          copied: m.contentCodeCopied,
          done: m.contentCodeCopiedNotice,
          failed: m.contentCodeCopyFailed,
        }}
        use:enhanceToc
        bind:this={prose}
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered by the API from a schema-validated document -->
        {@html entry.html}
      </div>
      <CalloutDismissal container={prose} html={entry.html} />
      {#if entry.pages.total > 1}
        <!-- Parts of an entry split by page breaks (WordPress "Pages: 1 2 3"). -->
        <nav
          aria-label={m.themePages}
          class="flex flex-wrap items-center gap-2 text-sm"
        >
          <span class="text-muted-foreground">{m.themePages}</span>
          {#each { length: entry.pages.total } as _, index (index)}
            {@const part = index + 1}
            {#if part === entry.pages.current}
              <span aria-current="page" class="font-semibold">{part}</span>
            {:else}
              <a
                class="underline"
                href={resolve(
                  (part > 1
                    ? `${entry.path}?page=${part}`
                    : entry.path) as Path,
                )}>{part}</a
              >
            {/if}
          {/each}
        </nav>
      {/if}
    {/if}
    <SlotOutlet fragments={slots?.['content.after'] ?? []} />
  </div>
{:else if post?.excerpt}
  <p class="cms-block-post-content text-muted-foreground">{post.excerpt}</p>
{/if}
