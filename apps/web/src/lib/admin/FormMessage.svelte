<script lang="ts">
  import { X } from '@lucide/svelte';
  import { errorMessage, issueLines } from '#lib/admin/form-errors.js';
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '#lib/components/ui/alert/index.js';
  import { announceResult, noticeText, useToasts } from '#lib/feedback.js';
  import type { ActionData, ToastAction } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Issue {
    path: string;
    message: string;
  }

  let {
    form,
    action,
  }: {
    form?: {
      message?: string;
      code?: string;
      issues?: unknown;
      notice?: string;
      count?: number;
    } | null;
    /** A button for the success toast (Undo). */
    action?: ToastAction;
  } = $props();

  const i18n = useI18n();
  // Under a toaster the outcome is a toast and only field issues stay here, next to the form.
  const toasts = useToasts();

  const issues = $derived(
    Array.isArray(form?.issues) ? (form.issues as Issue[]) : [],
  );
  const error = $derived(
    form?.message
      ? {
          title: errorMessage(i18n.m, i18n.language, {
            message: form.message,
            code: form.code,
            issues,
          }),
          lines: issueLines(i18n.m, i18n.language, issues),
        }
      : null,
  );

  const notice = $derived(form ? noticeText(i18n.m, form) : '');

  $effect(() => {
    // The result object itself: one toast however many messages show it.
    if (toasts) announceResult(i18n, form as ActionData | null, action);
  });

  // A dismissed message stays hidden until the next action result.
  let dismissed = $state<typeof form>(null);
</script>

{#snippet close()}
  <button
    type="button"
    class="absolute top-2 right-2 rounded p-1 hover:bg-muted"
    aria-label={i18n.m.dismiss}
    onclick={() => (dismissed = form)}><X class="size-4" /></button
  >
{/snippet}

{#if form && dismissed !== form}
  {#if toasts}
    <!-- The toast names the failure; the lines say which fields to fix. -->
    {#if error?.lines.length}
      <Alert variant="destructive" class="relative pr-10">
        <AlertDescription>
          <ul class="list-disc pl-4">
            {#each error.lines as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        </AlertDescription>
        {@render close()}
      </Alert>
    {/if}
  {:else if error}
    <Alert variant="destructive" class="relative pr-10">
      <AlertTitle>{error.title}</AlertTitle>
      {#if error.lines.length}
        <AlertDescription>
          <ul class="list-disc pl-4">
            {#each error.lines as line, index (index)}
              <li>{line}</li>
            {/each}
          </ul>
        </AlertDescription>
      {/if}
      {@render close()}
    </Alert>
  {:else if notice}
    <Alert class="relative pr-10" role="status">
      <AlertTitle>{notice}</AlertTitle>
      {@render close()}
    </Alert>
  {/if}
{/if}
