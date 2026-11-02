<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import {
    DATABASE_CLEANUP_AUTOSAVE_DAYS,
    databaseCleanupCategorySchema,
  } from '@cms/sdk';
  import type { DatabaseCleanupCategory, DatabaseTableSize } from '@cms/sdk';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '#lib/components/ui/table/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const result = $derived(form && 'result' in form ? form.result : null);
  const categories = databaseCleanupCategorySchema.options;
  const labels = $derived({
    revisions: m.databaseCleanupRevisions,
    autosaves: m.databaseCleanupAutosaves,
    trashedContent: m.databaseCleanupTrashedContent,
    spamComments: m.databaseCleanupSpamComments,
    trashedComments: m.databaseCleanupTrashedComments,
    expired: m.databaseCleanupExpired,
    optimize: m.databaseCleanupOptimize,
  });
  const helps = $derived({
    revisions: m.databaseCleanupRevisionsHelp,
    autosaves: m.databaseCleanupAutosavesHelp(DATABASE_CLEANUP_AUTOSAVE_DAYS),
    trashedContent: m.databaseCleanupTrashedContentHelp,
    spamComments: m.databaseCleanupSpamCommentsHelp,
    trashedComments: m.databaseCleanupTrashedCommentsHelp,
    expired: m.databaseCleanupExpiredHelp,
    optimize: m.databaseCleanupOptimizeHelp,
  });
  const amount = (category: DatabaseCleanupCategory, count: number) =>
    category === 'optimize'
      ? m.databaseCleanupTables(count)
      : m.databaseCleanupItems(count);

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const bytes = (value: number) => {
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    const number = new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: unit === 0 ? 0 : 1,
    }).format(size);
    return `${number} ${units[unit]}`;
  };
  const sizeOf = (table: DatabaseTableSize) =>
    table.dataBytes + table.indexBytes;
  const total = (tables: readonly DatabaseTableSize[]) =>
    tables.reduce((sum, table) => sum + sizeOf(table), 0);
  const totalFree = $derived(
    data.tables.reduce((sum, table) => sum + table.freeBytes, 0),
  );

  let selected = $state<DatabaseCleanupCategory[]>([]);
  let confirmed = $state(false);
  let busy = $state(false);
  let previewForm = $state<HTMLFormElement>();
  // Without JavaScript the selection state never updates, so the button only gates once hydrated;
  // the confirmation checkbox is `required` and the server re-checks both.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
</script>

<svelte:head><title>{m.toolsDatabase}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.databaseSize}</CardTitle></CardHeader>
  <CardContent class="text-sm">
    <p>
      {m.databaseSizeSummary(
        bytes(total(data.tables)),
        data.tables.length,
        bytes(totalFree),
      )}
    </p>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.toolsDatabase}</CardTitle></CardHeader>
  <CardContent class="grid gap-4 text-sm">
    <p>{m.databaseCleanupHelp}</p>
    <!-- Changing the number reloads the preview; the cleanup uses the previewed value. -->
    <form
      bind:this={previewForm}
      method="GET"
      data-sveltekit-keepfocus
      data-sveltekit-noscroll
      data-sveltekit-replacestate
      class="grid gap-1.5"
    >
      <Label for="keep-latest">{m.databaseCleanupKeepLatest}</Label>
      <div class="flex flex-wrap items-center gap-2">
        <Input
          id="keep-latest"
          type="number"
          name="keepLatest"
          min={0}
          step={1}
          required
          value={data.options.keepLatest}
          onchange={() => previewForm?.requestSubmit()}
          class="w-24"
        />
        <Button type="submit" variant="outline"
          >{m.databaseCleanupRefresh}</Button
        >
      </div>
      <p class="text-muted-foreground">{m.databaseCleanupKeepLatestHelp}</p>
    </form>
    <form
      method="POST"
      action="?/run"
      use:enhance={() => {
        busy = true;
        return async ({ result: outcome, update }) => {
          busy = false;
          if (outcome.type === 'success') {
            selected = [];
            confirmed = false;
          }
          await update({ reset: false });
        };
      }}
      class="grid gap-4"
    >
      <input type="hidden" name="keepLatest" value={data.options.keepLatest} />
      <fieldset class="grid gap-3">
        <legend class="mb-2 font-medium">{m.databaseCleanupTasks}</legend>
        {#each categories as category (category)}
          <label class="flex items-start gap-2">
            <input
              type="checkbox"
              name="category"
              value={category}
              bind:group={selected}
              class="mt-1"
            />
            <span class="grid gap-0.5">
              <span class="font-medium">
                {labels[category]}
                <span class="font-normal text-muted-foreground">
                  — {amount(category, data.counts[category])}
                </span>
              </span>
              <span class="text-muted-foreground">{helps[category]}</span>
            </span>
          </label>
        {/each}
      </fieldset>
      <Alert variant="destructive">
        <AlertDescription>{m.databaseCleanupWarning}</AlertDescription>
      </Alert>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          name="confirm"
          required
          bind:checked={confirmed}
        />
        {m.databaseCleanupConfirm}
      </label>
      <div>
        <Button
          type="submit"
          variant="destructive"
          disabled={busy || (hydrated && (!confirmed || selected.length === 0))}
          >{busy ? m.databaseCleanupRunning : m.databaseCleanupRun}</Button
        >
      </div>
    </form>
  </CardContent>
</Card>

{#if result}
  <Card>
    <CardHeader><CardTitle>{m.databaseCleanupResults}</CardTitle></CardHeader>
    <CardContent class="grid gap-4 text-sm">
      <ul class="grid gap-1">
        {#each result.categories.filter((category) => category !== 'optimize') as category (category)}
          <li>
            <span class="font-medium">{labels[category]}</span>
            — {m.databaseCleanupDeleted(result.deleted[category])}
          </li>
        {/each}
      </ul>
      {#if result.optimization}
        {@const { before, after } = result.optimization}
        {@const afterByTable = new Map(after.map((row) => [row.table, row]))}
        <p>
          <span class="font-medium">{labels.optimize}</span>
          — {m.databaseCleanupSizeChange(
            bytes(total(before)),
            bytes(total(after)),
          )}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.databaseCleanupTable}</TableHead>
              <TableHead class="text-right">{m.databaseCleanupBefore}</TableHead
              >
              <TableHead class="text-right">{m.databaseCleanupAfter}</TableHead>
              <TableHead class="text-right">{m.databaseCleanupFree}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each before as row (row.table)}
              {@const optimized = afterByTable.get(row.table)}
              <TableRow>
                <TableCell><code>{row.table}</code></TableCell>
                <TableCell class="text-right">{bytes(sizeOf(row))}</TableCell>
                <TableCell class="text-right"
                  >{optimized ? bytes(sizeOf(optimized)) : '—'}</TableCell
                >
                <TableCell class="text-right"
                  >{optimized ? bytes(optimized.freeBytes) : '—'}</TableCell
                >
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      {/if}
    </CardContent>
  </Card>
{/if}
