<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { resolve } from '$app/paths';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { blockLines, lineDiff, sideBySide } from '#lib/admin/diff.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const date = (value: string) => new Date(value).toLocaleString(i18n.language);
  let pickers = $state<HTMLFormElement>();
  /** Oldest first, like the WordPress slider. */
  const timeline = $derived([...data.revisions].reverse());
  const position = $derived(
    timeline.findIndex((revision) => revision.id === data.to?.id),
  );
  /** Shows `timeline[index]` against the version before it, through the pickers' form. */
  const step = (index: number) => {
    const to = timeline[index];
    const from = timeline[index - 1] ?? to;
    if (!to || !from || !pickers) return;
    pickers.from.value = from.id;
    pickers.to.value = to.id;
    pickers.requestSubmit();
  };

  const labels = $derived({
    image: m.editorImage,
    audio: m.mediaAudio,
    embed: m.insertEmbed,
  });
  const fields = $derived(
    data.from && data.to
      ? [
          {
            label: m.fieldTitle,
            rows: sideBySide(lineDiff([data.from.title], [data.to.title])),
          },
          {
            label: m.fieldExcerpt,
            rows: sideBySide(
              lineDiff(
                data.from.excerpt.split('\n'),
                data.to.excerpt.split('\n'),
              ),
            ),
          },
          {
            label: m.fieldBody,
            rows: sideBySide(
              lineDiff(
                blockLines(data.from.document, labels),
                blockLines(data.to.document, labels),
              ),
            ),
          },
        ].filter((field) => field.rows.some((row) => row.changed))
      : [],
  );

  const confirmRestore: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.revisionRestoreAsk)) cancel();
  };
</script>

{#snippet meta(
  label: string,
  version: { kind: string; authorName: string; createdAt: string; id: string },
)}
  <p class="text-sm">
    <span class="font-medium">{label}:</span>
    {version.authorName} · {date(version.createdAt)}
    {#if version.kind === 'autosave'}<Badge variant="outline" class="ml-1"
        >{m.revisionAutosave}</Badge
      >{:else if version.id === data.current}<Badge
        variant="secondary"
        class="ml-1">{m.revisionCurrent}</Badge
      >{/if}
  </p>
{/snippet}

<svelte:head
  ><title>{m.revisionsCompareTitle(data.entry.title)}</title></svelte:head
>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">
    {m.revisionsCompareTitle(data.entry.title)}
  </h1>
  <Button
    variant="outline"
    href={resolve('/admin/(app)/content/[id]', { id: data.entry.id })}
    >{m.returnToEditor}</Button
  >
</div>

<FormMessage {form} />

{#if data.from && data.to}
  <div class="space-y-4 rounded-md border bg-background p-4">
    <div class="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={position <= 1}
        onclick={() => step(position - 1)}>{m.previous}</Button
      >
      <input
        type="range"
        class="min-w-0 flex-1 accent-primary"
        min={1}
        max={Math.max(1, timeline.length - 1)}
        value={position}
        disabled={timeline.length < 2}
        aria-label={m.revisionTimeline}
        aria-valuetext={date(data.to.createdAt)}
        onchange={(event) => step(Number(event.currentTarget.value))}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={position >= timeline.length - 1}
        onclick={() => step(position + 1)}>{m.next}</Button
      >
    </div>

    <!-- Any two versions: a plain GET form, so the choice is a shareable address. -->
    <form
      bind:this={pickers}
      method="GET"
      class="flex flex-wrap items-end gap-3"
    >
      {#each [{ name: 'from', label: m.revisionFrom, value: data.from.id }, { name: 'to', label: m.revisionTo, value: data.to.id }] as picker (picker.name)}
        <label class="grid gap-1 text-sm">
          {picker.label}
          <NativeSelect name={picker.name} value={picker.value}>
            {#each data.revisions as revision (revision.id)}
              <NativeSelectOption value={revision.id}
                >{date(revision.createdAt)} · {revision.authorName}{revision.kind ===
                'autosave'
                  ? ` (${m.revisionAutosave})`
                  : ''}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </label>
      {/each}
      <Button type="submit" variant="outline">{m.revisionCompare}</Button>
    </form>

    <div class="grid gap-2 sm:grid-cols-2">
      {@render meta(m.revisionFrom, data.from)}
      <div class="flex flex-wrap items-center justify-between gap-2">
        {@render meta(m.revisionTo, data.to)}
        {#if data.to.id !== data.current}
          <form method="POST" action="?/restore" use:enhance={confirmRestore}>
            <input type="hidden" name="revisionId" value={data.to.id} />
            <Button type="submit" size="sm">{m.revisionRestore}</Button>
          </form>
        {/if}
      </div>
    </div>
  </div>

  {#each fields as field (field.label)}
    <section class="space-y-2">
      <h2 class="font-medium">{field.label}</h2>
      <table
        class="w-full table-fixed border-collapse overflow-hidden rounded-md border bg-background text-sm"
      >
        <thead class="sr-only">
          <tr
            ><th scope="col">{m.revisionFrom}</th><th scope="col"
              >{m.revisionTo}</th
            ></tr
          >
        </thead>
        <tbody>
          {#each field.rows as row, index (index)}
            <tr class="align-top">
              <td
                class="border-r px-3 py-1 break-words whitespace-pre-wrap {row.changed &&
                row.before !== undefined
                  ? 'bg-red-500/15'
                  : ''}"
              >
                {#if row.changed && row.before !== undefined}<span
                    class="sr-only">{m.diffRemoved}:</span
                  >{/if}{row.before ?? ''}
              </td>
              <td
                class="px-3 py-1 break-words whitespace-pre-wrap {row.changed &&
                row.after !== undefined
                  ? 'bg-green-500/15'
                  : ''}"
              >
                {#if row.changed && row.after !== undefined}<span
                    class="sr-only">{m.diffAdded}:</span
                  >{/if}{row.after ?? ''}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {:else}
    <p class="text-sm text-muted-foreground">{m.revisionsIdentical}</p>
  {/each}
{:else}
  <p class="text-sm text-muted-foreground">{m.revisionsEmpty}</p>
{/if}
