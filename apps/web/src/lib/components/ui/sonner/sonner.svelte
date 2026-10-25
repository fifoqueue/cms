<script lang="ts">
  import { default as CircleCheck } from '@lucide/svelte/icons/circle-check';
  import { default as Info } from '@lucide/svelte/icons/info';
  import { default as LoaderCircle } from '@lucide/svelte/icons/loader-circle';
  import { default as OctagonX } from '@lucide/svelte/icons/octagon-x';
  import { default as TriangleAlert } from '@lucide/svelte/icons/triangle-alert';
  import { default as X } from '@lucide/svelte/icons/x';
  import { Toaster as Sonner } from 'svelte-sonner';
  import type { ToasterProps } from 'svelte-sonner';

  let { toastOptions, ...restProps }: ToasterProps = $props();
</script>

<Sonner
  class="toaster group"
  style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border); --border-radius: var(--radius);"
  toastOptions={{
    ...toastOptions,
    classes: {
      toast: 'font-sans shadow-lg',
      description: 'text-muted-foreground!',
      closeButton:
        'bg-popover! text-popover-foreground! border-border! hover:bg-muted!',
      actionButton:
        'bg-primary! text-primary-foreground! font-medium! hover:bg-primary/90!',
      ...toastOptions?.classes,
    },
  }}
  {...restProps}
>
  {#snippet loadingIcon()}
    <LoaderCircle class="size-4 animate-spin" />
  {/snippet}
  {#snippet successIcon()}
    <CircleCheck class="size-4" />
  {/snippet}
  {#snippet errorIcon()}
    <OctagonX class="size-4 text-destructive" />
  {/snippet}
  {#snippet infoIcon()}
    <Info class="size-4" />
  {/snippet}
  {#snippet warningIcon()}
    <TriangleAlert class="size-4" />
  {/snippet}
  {#snippet closeIcon()}
    <X class="size-3" />
  {/snippet}
</Sonner>
