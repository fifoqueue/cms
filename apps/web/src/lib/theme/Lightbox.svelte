<script lang="ts" module>
  export interface LightboxItem {
    src: string;
    srcset?: string;
    alt: string;
    caption: string;
  }
</script>

<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { default as X } from '@lucide/svelte/icons/x';
  import { default as ChevronLeft } from '@lucide/svelte/icons/chevron-left';
  import { default as ChevronRight } from '@lucide/svelte/icons/chevron-right';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * A full-screen image viewer, inside the site wrapper so the theme's variables apply. A larger
   * `srcset` candidate is chosen than in the column; several items get previous/next buttons
   * and the arrow keys.
   */
  interface Props {
    items: LightboxItem[];
    index?: number;
    open: boolean;
  }

  let { items, index = $bindable(0), open = $bindable() }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const item = $derived(items[index]);

  const step = (delta: number) => {
    index = (index + delta + items.length) % items.length;
  };

  const control =
    'absolute z-10 flex size-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none';
</script>

<Dialog.Root bind:open>
  <!-- Inside the site wrapper, which carries the theme's variables. -->
  <Dialog.Portal to=".cms-site">
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/85 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-14"
      onclick={(event) => {
        if (event.target === event.currentTarget) open = false;
      }}
      onkeydown={(event) => {
        if (items.length < 2) return;
        if (event.key === 'ArrowLeft') step(-1);
        else if (event.key === 'ArrowRight') step(1);
        else return;
        event.preventDefault();
      }}
    >
      <Dialog.Title class="sr-only">{m.themeLightboxTitle}</Dialog.Title>
      {#if item}
        {#key index}
          <figure class="flex max-h-full max-w-full flex-col items-center gap-3">
            <img
              src={item.src}
              srcset={item.srcset}
              sizes={item.srcset ? '100vw' : undefined}
              alt={item.alt}
              class="max-h-[calc(100dvh-7rem)] max-w-full rounded-[var(--radius)] object-contain"
            />
            {#if item.caption}
              <figcaption class="text-center text-sm text-white/80">
                {item.caption}
              </figcaption>
            {/if}
          </figure>
        {/key}
      {/if}
      {#if items.length > 1}
        <button
          type="button"
          class="{control} top-1/2 left-3 -translate-y-1/2"
          aria-label={m.themeLightboxPrevious}
          onclick={() => step(-1)}><ChevronLeft class="size-6" /></button
        >
        <button
          type="button"
          class="{control} top-1/2 right-3 -translate-y-1/2"
          aria-label={m.themeLightboxNext}
          onclick={() => step(1)}><ChevronRight class="size-6" /></button
        >
        <p
          class="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm text-white/80"
          aria-live="polite"
        >
          {m.themeLightboxPosition(index + 1, items.length)}
        </p>
      {/if}
      <Dialog.Close class="{control} top-3 right-3" aria-label={m.themeLightboxClose}
        ><X class="size-5" /></Dialog.Close
      >
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
