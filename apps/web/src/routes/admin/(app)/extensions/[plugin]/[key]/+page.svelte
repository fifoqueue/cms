<script lang="ts">
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import SettingFields from '#lib/admin/SettingFields.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Card, CardContent } from '#lib/components/ui/card/index.js';
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
</script>

<svelte:head
  ><title>{data.page?.title ?? m.pluginPageFailed}</title></svelte:head
>

<FormMessage {form} />

{#if !data.page}
  <Alert variant="destructive"
    ><AlertTitle>{m.pluginPageFailed}</AlertTitle></Alert
  >
{:else}
  <h1 class="text-2xl font-semibold">{data.page.title}</h1>
  {#each data.page.blocks as block, index (index)}
    {#if block.kind === 'heading'}
      <h2 class="text-lg font-semibold">{block.text}</h2>
    {:else if block.kind === 'text'}
      <p class="text-sm whitespace-pre-line">{block.text}</p>
    {:else if block.kind === 'notice'}
      <Alert variant={block.tone === 'warning' ? 'destructive' : 'default'}>
        <AlertTitle>{block.text}</AlertTitle>
      </Alert>
    {:else if block.kind === 'stats'}
      <div class="grid gap-3 sm:grid-cols-3">
        {#each block.items as item, itemIndex (itemIndex)}
          <Card>
            <CardContent class="pt-6">
              <p class="text-sm text-muted-foreground">{item.label}</p>
              <p class="text-2xl font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        {/each}
      </div>
    {:else if block.kind === 'table'}
      <div class="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              {#each block.columns as column, columnIndex (columnIndex)}
                <TableHead>{column}</TableHead>
              {/each}
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each block.rows as row, rowIndex (rowIndex)}
              <TableRow>
                {#each row as cell, cellIndex (cellIndex)}
                  <TableCell>{cell}</TableCell>
                {/each}
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {:else if block.kind === 'form'}
      <form
        method="POST"
        action="?/run"
        use:enhance={() =>
          ({ update }) =>
            update({ reset: false })}
        class="grid gap-4 rounded-md border bg-background p-4"
      >
        <input type="hidden" name="action" value={block.action} />
        <SettingFields
          fields={block.fields}
          values={{}}
          idPrefix="{block.action}-{index}"
        />
        <div><Button type="submit" size="sm">{block.submit}</Button></div>
      </form>
    {/if}
  {/each}
{/if}
