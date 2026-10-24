<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { errorMessage } from '#lib/admin/form-errors.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type {
    Moderated,
    ModerationOperation,
  } from '#lib/theme/CommentModeration.svelte';

  interface Props {
    commentIds: string[];
    contentId: string;
    action: string;
    onmoderated: (result: Moderated) => void;
    /** A refused or failed request, as a message for the reader. */
    onfailed: (message: string) => void;
    /** Any comment action on the page is in flight; one runs at a time. */
    locked: boolean;
    onbusy: (busy: boolean) => void;
  }

  let {
    commentIds,
    contentId,
    action,
    onmoderated,
    onfailed,
    locked,
    onbusy,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let form = $state<HTMLFormElement>();
  let operationField = $state<HTMLInputElement>();
  let confirmField = $state<HTMLInputElement>();

  /** Sends `operation` for the comments; only a deletion the reader confirmed carries `confirm`. */
  export const run = (operation: ModerationOperation) => {
    operationField!.value = operation;
    confirmField!.value = operation === 'delete' ? 'delete' : '';
    form!.requestSubmit();
  };

  const submit: SubmitFunction<Moderated> = ({ cancel }) => {
    if (locked) {
      cancel();
      return;
    }
    onbusy(true);
    return async ({ result, update }) => {
      try {
        if (result.type === 'success' && result.data?.moderated)
          onmoderated(result.data);
        else if (result.type === 'redirect') await update();
        else if (result.type === 'failure' && result.data)
          onfailed(errorMessage(m, i18n.language, result.data));
        else onfailed(m.errorGeneric);
      } finally {
        onbusy(false);
      }
    };
  };
</script>

<form method="POST" {action} use:enhance={submit} bind:this={form} hidden>
  {#each commentIds as id (id)}
    <input type="hidden" name="commentId" value={id} />
  {/each}
  <input type="hidden" name="contentId" value={contentId} />
  <input type="hidden" name="operation" bind:this={operationField} />
  <input type="hidden" name="confirm" bind:this={confirmField} />
</form>
