<script lang="ts">
  import { AlertDialog } from 'bits-ui';
  import { CircleAlert, TriangleAlert } from '@lucide/svelte';
  import { buttonVariants } from '#lib/components/ui/button/button.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import { cn } from '#lib/utils.js';

  interface Props {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    /** Cannot be undone; the confirm button and icon read as dangerous. */
    destructive?: boolean;
    /**
     * A click outside closes the dialog like Cancel. Defaults to on for reversible actions and
     * off for destructive ones, so a stray click never dismisses an irreversible choice.
     */
    dismissible?: boolean;
    onconfirm: () => void;
  }

  let {
    open = $bindable(),
    title,
    description,
    confirmLabel,
    destructive = false,
    dismissible = !destructive,
    onconfirm,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<AlertDialog.Root bind:open>
  <!-- Inside the site wrapper, which carries the theme's colors. -->
  <AlertDialog.Portal to=".cms-site">
    <AlertDialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <AlertDialog.Content
      interactOutsideBehavior={dismissible ? 'close' : 'ignore'}
      class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border bg-background p-6 text-foreground shadow-xl duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <div class="flex gap-4">
        <span
          class={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            destructive
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary',
          )}
          aria-hidden="true"
        >
          {#if destructive}<TriangleAlert class="size-5" />{:else}<CircleAlert
              class="size-5"
            />{/if}
        </span>
        <div class="grid min-w-0 gap-1.5 pt-0.5">
          <AlertDialog.Title class="text-base font-semibold"
            >{title}</AlertDialog.Title
          >
          <AlertDialog.Description
            class="text-sm leading-relaxed text-muted-foreground"
            >{description}</AlertDialog.Description
          >
        </div>
      </div>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <AlertDialog.Cancel class={buttonVariants({ variant: 'outline' })}
          >{m.cancel}</AlertDialog.Cancel
        >
        <AlertDialog.Action
          class={cn(
            buttonVariants(),
            destructive &&
              'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40',
          )}
          onclick={() => {
            open = false;
            onconfirm();
          }}>{confirmLabel}</AlertDialog.Action
        >
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
