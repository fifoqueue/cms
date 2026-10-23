<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { AdminBlock } from '@cms/sdk';
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

  let {
    blocks,
    form,
  }: {
    /** Plugin blocks, already checked against the block schema by the API. */
    blocks: readonly AdminBlock[];
    /** How `form` blocks render; without it they are left out (dashboard widgets). */
    form?: Snippet<[Extract<AdminBlock, { kind: 'form' }>, number]>;
  } = $props();
</script>

{#each blocks as block, index (index)}
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
    <div class="overflow-x-auto rounded-md border bg-background">
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
  {:else if block.kind === 'form' && form}
    {@render form(block, index)}
  {/if}
{/each}
