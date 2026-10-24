<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ToasterProps } from 'svelte-sonner';
  import { Toaster } from '#lib/components/ui/sonner/index.js';
  import { provideToasts } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * The toaster of a layout, bottom right. `lift` (a CSS length) raises the toasts above fixed
   * controls at the bottom of the viewport. Content below announces its outcomes here.
   */
  let {
    theme,
    lift = '0px',
    children,
  }: {
    theme: ToasterProps['theme'];
    lift?: string;
    children: Snippet;
  } = $props();

  provideToasts(true);
  const i18n = useI18n();
</script>

<Toaster
  position="bottom-right"
  {theme}
  closeButton
  containerAriaLabel={i18n.m.notifications}
  closeButtonAriaLabel={i18n.m.dismiss}
  offset={{ bottom: `calc(24px + ${lift})`, right: '24px' }}
  mobileOffset={{
    bottom: `calc(16px + ${lift})`,
    right: '16px',
    left: '16px',
  }}
/>
{@render children()}
