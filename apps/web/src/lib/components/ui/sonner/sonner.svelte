<script lang="ts">
  import {
    CircleCheck,
    Info,
    LoaderCircle,
    OctagonX,
    TriangleAlert,
    X,
  } from '@lucide/svelte';
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
