<script lang="ts">
  import type { FootnotePages } from '#lib/admin/editor/footnote-notes.js';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * The notes the published entry will list, live from the editor document (never part of
   * it): each label once with its resolved text, a page heading when page breaks restart them.
   */
  let { pages }: { pages: FootnotePages['pages'] } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $props.id();
  const paged = $derived(pages.some(({ page }) => page > 1));
</script>

{#if pages.length}
  <section
    class="grid gap-2 border-t px-4 py-3 text-base leading-relaxed"
    aria-labelledby={id}
  >
    <h2 {id} class="text-sm font-medium text-muted-foreground">
      {m.footnotePreview}
    </h2>
    {#each pages as { page, notes } (page)}
      {#if paged}
        <h3 class="text-sm font-medium text-muted-foreground">
          {m.footnotePreviewPage(page)}
        </h3>
      {/if}
      <ol class="grid gap-1">
        {#each notes as note, index (index)}
          <li
            class="grid grid-cols-[auto_minmax(0,1fr)] gap-2 whitespace-pre-wrap wrap-anywhere"
          >
            <span class="max-w-48 font-semibold text-primary tabular-nums"
              >[{note.label}]</span
            >
            {#if note.text}<span>{note.text}</span>{:else}<span
                class="text-muted-foreground italic">{m.footnoteEmpty}</span
              >{/if}
          </li>
        {/each}
      </ol>
    {/each}
  </section>
{/if}
