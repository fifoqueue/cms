<script lang="ts">
  import { resolve } from '$app/paths';
  import { documentText } from '#lib/admin/seo.js';
  import { lineDiff } from '#lib/admin/diff.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  /** Title, excerpt and body as comparable lines. */
  const lines = (text: {
    title: string;
    excerpt: string;
    document: unknown;
  }) => [
    text.title,
    text.excerpt,
    '',
    ...documentText(text.document as never).text.split(/(?<=[.!?。])\s+/),
  ];
  const diff = $derived(lineDiff(lines(data.revision), lines(data.entry)));
</script>

<svelte:head
  ><title>{m.revisionCompare} · {data.entry.title}</title></svelte:head
>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">{m.revisionCompare}</h1>
  <Button
    variant="outline"
    href={resolve('/admin/(app)/content/[id]', { id: data.entry.id })}
    >{m.cancel}</Button
  >
</div>

<p class="text-sm text-muted-foreground">
  <span class="rounded bg-red-500/15 px-1">− {m.revisionSelected}</span>
  <span class="ml-2 rounded bg-green-500/15 px-1">+ {m.revisionCurrent}</span>
</p>

<pre
  class="overflow-x-auto rounded-md border bg-background p-4 text-sm whitespace-pre-wrap">{#each diff as line, index (index)}<span
      class="block {line.kind === 'removed'
        ? 'bg-red-500/15'
        : line.kind === 'added'
          ? 'bg-green-500/15'
          : ''}"
      >{line.kind === 'removed'
        ? '− '
        : line.kind === 'added'
          ? '+ '
          : '  '}{line.text}</span
    >{/each}</pre>
