<script lang="ts">
  import { Eye, EyeOff } from '@lucide/svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { Input } from '#lib/components/ui/input/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { authMessages } from '#lib/i18n/auth.js';

  /** A password field whose toggle shows what was typed, instead of asking for it twice. */
  let {
    id,
    ...rest
  }: Omit<HTMLInputAttributes, 'type' | 'class' | 'value' | 'files'> & {
    id: string;
  } = $props();

  const i18n = useI18n();
  let visible = $state(false);
  let input = $state<HTMLInputElement | null>(null);

  // Submitted while shown, the value would otherwise be offered to the browser as plain text.
  $effect(() => {
    const form = input?.form;
    if (!form) return;
    const hide = () => (visible = false);
    form.addEventListener('submit', hide);
    return () => form.removeEventListener('submit', hide);
  });
</script>

<div class="relative">
  <Input
    bind:ref={input}
    {id}
    type={visible ? 'text' : 'password'}
    class="pe-10"
    {...rest}
  />
  <button
    type="button"
    class="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
    aria-label={authMessages(i18n.language).showPassword}
    aria-controls={id}
    aria-pressed={visible}
    onclick={() => (visible = !visible)}
  >
    {#if visible}<EyeOff class="size-4" aria-hidden="true" />{:else}<Eye
        class="size-4"
        aria-hidden="true"
      />{/if}
  </button>
</div>
