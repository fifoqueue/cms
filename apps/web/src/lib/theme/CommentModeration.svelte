<script module lang="ts">
  import type { Messages } from '#lib/i18n/index.js';
  import type { CommentManagement } from '#lib/server/comments.js';
  import type { ModerationActionResult } from '#lib/server/comment-moderation.js';

  export type ModerationStatus = CommentManagement['items'][number]['status'];
  /** The enhanced `?/moderateComment` result. */
  export type Moderated = ModerationActionResult;
  export type ModerationOperation = Moderated['operation'];

  /** Notices a moderation redirect may name (`?commentNotice=`); anything else is ignored. */
  export const MODERATION_NOTICES = [
    'commentNoticeApproved',
    'commentNoticeUnapproved',
    'commentNoticeTrash',
    'commentNoticeDeleted',
  ] as const satisfies readonly Moderated['notice'][];

  /** What a moderator can do from each status, before the confirmed deletion. */
  const OPERATIONS: Record<ModerationStatus, ModerationOperation[]> = {
    pending: ['approve', 'trash'],
    approved: ['unapprove', 'trash'],
    spam: ['approve', 'trash'],
    trash: ['approve', 'unapprove'],
  };

  /** Every operation, in menu order; what the bulk bar offers. */
  export const BULK_OPERATIONS: ModerationOperation[] = [
    'approve',
    'unapprove',
    'trash',
    'delete',
  ];

  export const operationLabel = (m: Messages, operation: ModerationOperation) =>
    ({
      approve: m.commentApprove,
      unapprove: m.commentUnapprove,
      trash: m.moveToTrash,
      delete: m.deletePermanently,
    })[operation];
</script>

<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { default as Check } from '@lucide/svelte/icons/check';
  import { default as CircleX } from '@lucide/svelte/icons/circle-x';
  import { default as Ellipsis } from '@lucide/svelte/icons/ellipsis';
  import { default as LoaderCircle } from '@lucide/svelte/icons/loader-circle';
  import { default as Trash2 } from '@lucide/svelte/icons/trash-2';
  import { default as Undo2 } from '@lucide/svelte/icons/undo-2';
  import { buttonVariants } from '#lib/components/ui/button/button.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import ConfirmDialog from '#lib/theme/ConfirmDialog.svelte';
  import ModerationForm from '#lib/theme/ModerationForm.svelte';

  interface Props {
    commentId: string;
    contentId: string;
    status: ModerationStatus;
    /** Commenter name, naming the menu for assistive technology. */
    authorName: string;
    action: string;
    onmoderated: (result: Moderated) => void;
    onfailed: (message: string) => void;
    /** Any comment action on the page is in flight; one runs at a time. */
    locked: boolean;
    onbusy: (busy: boolean) => void;
  }

  let {
    commentId,
    contentId,
    status,
    authorName,
    action,
    onmoderated,
    onfailed,
    locked,
    onbusy,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let form = $state<ModerationForm>();
  let busy = $state(false);
  let confirming = $state(false);
  const icons = { approve: Check, unapprove: Undo2, trash: Trash2 };
  const item =
    'flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';
</script>

<ModerationForm
  bind:this={form}
  commentIds={[commentId]}
  {contentId}
  {action}
  {onmoderated}
  {onfailed}
  {locked}
  onbusy={(value) => {
    busy = value;
    onbusy(value);
  }}
/>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={buttonVariants({
      variant: 'ghost',
      size: 'icon-sm',
      class: '-my-1 text-muted-foreground',
    })}
    aria-label={m.commentModerationFor(authorName)}
    disabled={locked}
  >
    {#if busy}<LoaderCircle class="animate-spin" />{:else}<Ellipsis />{/if}
  </DropdownMenu.Trigger>
  <!-- Inside the site wrapper, which carries the theme's colors. -->
  <DropdownMenu.Portal to=".cms-site">
    <DropdownMenu.Content
      align="end"
      sideOffset={4}
      class="z-50 grid min-w-44 gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      {#each OPERATIONS[status] as operation (operation)}
        {@const Icon = icons[operation as keyof typeof icons]}
        <DropdownMenu.Item
          class={item}
          disabled={locked}
          onSelect={() => form?.run(operation)}
          ><Icon aria-hidden="true" />{operationLabel(
            m,
            operation,
          )}</DropdownMenu.Item
        >
      {/each}
      <DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
      <DropdownMenu.Item
        class="{item} text-destructive data-highlighted:bg-destructive/10 [&_svg]:text-destructive"
        disabled={locked}
        onSelect={() => (confirming = true)}
        ><CircleX aria-hidden="true" />{m.deletePermanently}</DropdownMenu.Item
      >
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<ConfirmDialog
  bind:open={confirming}
  title={m.deletePermanently}
  description={m.commentDeleteAsk}
  confirmLabel={m.deletePermanently}
  destructive
  onconfirm={() => form?.run('delete')}
/>
