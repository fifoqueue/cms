<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import {
    HEADING_LEVELS,
    collectHeadings,
    tocDefaults,
    tocPage,
  } from '@cms/content/toc';
  import type { TocAttrs } from '@cms/content/toc';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    editor,
    pos,
    revision,
  }: {
    editor: Editor;
    pos: number;
    revision: number;
  } = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const attrs: TocAttrs = $derived(
    revision >= 0
      ? { ...tocDefaults, ...editor.state.doc.nodeAt(pos)?.attrs }
      : tocDefaults,
  );
  const page = $derived(revision >= 0 ? tocPage(editor.state.doc, pos) : 1);
  const headings = $derived(
    revision >= 0
      ? collectHeadings(editor.state.doc).filter(
          (heading) => heading.page === page,
        )
      : [],
  );

  const update = (patch: Partial<TocAttrs>) => {
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name !== 'tableOfContents') return;
    const present = new Set(headings.map((heading) => heading.id));
    patch.excluded = (patch.excluded ?? attrs.excluded)
      .filter((id) => present.has(id))
      .slice(0, 100);
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ...patch,
      }),
    );
  };
  const minimum = (value: string) => {
    const count = Number(value);
    if (Number.isSafeInteger(count) && count >= 0 && count <= 100)
      update({ minHeadings: count });
  };
</script>

<label class="grid gap-1">
  {m.contentTocTitle}
  <Input
    value={attrs.title}
    maxlength={200}
    oninput={(event) => update({ title: event.currentTarget.value })}
  />
</label>
<fieldset class="grid gap-2">
  <legend class="mb-1 font-medium">{m.contentTocLevels}</legend>
  {#each HEADING_LEVELS as level (level)}
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        checked={attrs.levels.includes(level)}
        onchange={(event) =>
          update({
            levels: event.currentTarget.checked
              ? [...attrs.levels, level].sort()
              : attrs.levels.filter((value) => value !== level),
          })}
      />
      {m.contentTocLevel(level)}
    </label>
  {/each}
</fieldset>
<label class="grid gap-1">
  {m.contentTocMinHeadings}
  <Input
    type="number"
    min={0}
    max={100}
    step={1}
    value={attrs.minHeadings}
    oninput={(event) => minimum(event.currentTarget.value)}
  />
</label>
<fieldset class="grid gap-2">
  <legend class="mb-1 font-medium">{m.contentTocExcluded}</legend>
  <p class="text-xs text-muted-foreground">{m.contentTocPageHelp}</p>
  {#each headings as heading (heading.id)}
    <label class="flex items-start gap-2">
      <input
        type="checkbox"
        checked={attrs.excluded.includes(heading.id)}
        onchange={(event) =>
          update({
            excluded: event.currentTarget.checked
              ? [...attrs.excluded, heading.id]
              : attrs.excluded.filter((id) => id !== heading.id),
          })}
      />
      <span class="min-w-0 break-words">
        {heading.text}
        <small class="block text-muted-foreground">#{heading.id}</small>
      </span>
    </label>
  {:else}
    <p class="text-muted-foreground">{m.contentTocEmpty}</p>
  {/each}
</fieldset>
<label class="flex items-center gap-2">
  <input
    type="checkbox"
    checked={attrs.collapsible}
    onchange={(event) => update({ collapsible: event.currentTarget.checked })}
  />
  {m.contentTocCollapsible}
</label>
<label class="flex items-center gap-2">
  <input
    type="checkbox"
    checked={attrs.open}
    disabled={!attrs.collapsible}
    onchange={(event) => update({ open: event.currentTarget.checked })}
  />
  {m.contentTocOpen}
</label>
