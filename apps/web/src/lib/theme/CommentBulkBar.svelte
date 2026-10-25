<script lang="ts">
  import { default as ListChecks } from '@lucide/svelte/icons/list-checks';
  import { default as LoaderCircle } from '@lucide/svelte/icons/loader-circle';
  import { buttonVariants } from '#lib/components/ui/button/button.svelte';
  import { notifyFailure } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';
  import {
    BULK_OPERATIONS,
    operationLabel,
  } from '#lib/theme/CommentModeration.svelte';
  import type {
    Moderated,
    ModerationOperation,
  } from '#lib/theme/CommentModeration.svelte';
  import ConfirmDialog from '#lib/theme/ConfirmDialog.svelte';
  import ModerationForm from '#lib/theme/ModerationForm.svelte';

  interface Props {
    selected: string[];
    /** Comments shown on this page that can be selected. */
    selectable: number;
    ontoggleall: (selected: boolean) => void;
    onexit: () => void;
    contentId: string;
    action: string;
    onmoderated: (result: Moderated) => void;
    locked: boolean;
    onbusy: (busy: boolean) => void;
  }

  let {
    selected,
    selectable,
    ontoggleall,
    onexit,
    contentId,
    action,
    onmoderated,
    locked,
    onbusy,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let form = $state<ModerationForm>();
  let operation = $state<ModerationOperation | ''>('');
  let confirming = $state(false);
  let busy = $state(false);
  const allSelected = $derived(
    selectable > 0 && selected.length === selectable,
  );

  let bar = $state<HTMLElement>();
  // Publishes the space the bar takes at the viewport bottom (height + bottom gap) so other
  // fixed controls, such as the back-to-top button, can rise above it.
  $effect(() => {
    if (!bar) return;
    const section = bar;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      // Layout height and CSS offset, not the bounding box: the bar slides in with a transform.
      const offset =
        section.offsetHeight + parseFloat(getComputedStyle(section).bottom);
      root.style.setProperty('--cms-bulk-bar-offset', `${offset}px`);
    });
    observer.observe(section);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--cms-bulk-bar-offset');
    };
  });
</script>

<ModerationForm
  bind:this={form}
  commentIds={selected}
  {contentId}
  {action}
  onmoderated={(result) => {
    operation = '';
    onmoderated(result);
  }}
  onfailed={notifyFailure}
  {locked}
  onbusy={(value) => {
    busy = value;
    onbusy(value);
  }}
/>

<section
  bind:this={bar}
  aria-label={m.commentBulkManage}
  class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-3xl gap-2 rounded-xl border bg-background/90 p-3 shadow-lg backdrop-blur-md duration-200 animate-in fade-in-0 slide-in-from-bottom-4"
>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <p class="flex items-center gap-2 text-sm" role="status">
      <ListChecks class="size-4 text-muted-foreground" aria-hidden="true" />
      <span class="font-semibold">{m.commentBulkManage}</span>
      <span class="text-muted-foreground tabular-nums"
        >{m.commentBulkSelected(selected.length)}</span
      >
    </p>
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        class="size-4 accent-primary"
        checked={allSelected}
        disabled={locked || !selectable}
        onchange={(event) => ontoggleall(event.currentTarget.checked)}
      />{m.selectAll}
    </label>
    <div class="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2">
      <select
        aria-label={m.bulkActions}
        bind:value={operation}
        disabled={locked}
        class="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm sm:flex-none"
      >
        <option value="">{m.bulkActions}</option>
        {#each BULK_OPERATIONS as option (option)}
          <option value={option}>{operationLabel(m, option)}</option>
        {/each}
      </select>
      <button
        type="button"
        class={buttonVariants({ size: 'sm' })}
        disabled={locked || !operation || !selected.length}
        onclick={() => (confirming = true)}
      >
        {#if busy}<LoaderCircle
            class="animate-spin"
            aria-hidden="true"
          />{/if}{m.apply}
      </button>
      <button
        type="button"
        class={buttonVariants({ variant: 'ghost', size: 'sm' })}
        disabled={locked}
        onclick={onexit}>{m.close}</button
      >
    </div>
  </div>
</section>

{#if operation}
  <ConfirmDialog
    bind:open={confirming}
    title={operationLabel(m, operation)}
    description={operation === 'delete'
      ? m.commentBulkDeleteAsk(selected.length)
      : m.commentBulkAsk(selected.length)}
    confirmLabel={operationLabel(m, operation)}
    destructive={operation === 'delete'}
    onconfirm={() => {
      if (operation) form?.run(operation);
    }}
  />
{/if}
