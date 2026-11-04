<script lang="ts">
  import type { PublicCaptcha } from '@cms/sdk';
  import { onMount } from 'svelte';
  import { useI18n } from '#lib/i18n/context.js';
  import {
    CAPTCHA_TOKEN_FIELD,
    mountWidget,
    type MountedWidget,
  } from '#lib/security/captcha-widget.js';

  /**
   * The captcha widget the API describes, core or plugin alike: its script, an element with
   * its `data-*` attributes, how it renders (`mountWidget`) and the field its token arrives in.
   * The token is submitted as `CAPTCHA_TOKEN_FIELD`. Without a widget nothing renders.
   */
  let {
    captcha,
    onchange,
  }: {
    captcha: PublicCaptcha;
    onchange?: (ready: boolean) => void;
  } = $props();
  const i18n = useI18n();
  let frame = $state<HTMLDivElement>();
  let element = $state<HTMLDivElement>();
  let tokenInput = $state<HTMLInputElement>();
  let mounted: MountedWidget | undefined;
  let token = $state('');
  let failed = $state(false);

  const widget = $derived(captcha.provider === 'none' ? null : captcha.widget);

  const set = (value: string) => {
    token = value;
    // The field holds the new value before the next render.
    if (tokenInput) tokenInput.value = value;
    if (value) failed = false;
    onchange?.(!!value);
  };

  /** Clears the token and the widget; call after every submission attempt. */
  export function reset() {
    set('');
    mounted?.reset();
  }

  onMount(() => {
    if (!widget || !frame || !element) return;

    mounted = mountWidget(element, widget, captcha.siteKey, {
      frame,
      onToken: set,
      onError: () => {
        set('');
        failed = true;
      },
    });

    return () => {
      mounted?.destroy();
      mounted = undefined;
      set('');
    };
  });
</script>

{#if widget}
  {#if widget.responseField !== CAPTCHA_TOKEN_FIELD}
    <!-- What the server reads, whichever field the provider fills. -->
    <input
      bind:this={tokenInput}
      type="hidden"
      name={CAPTCHA_TOKEN_FIELD}
      value={token}
    />
  {/if}
  <!-- Never wider than the form: a narrower one scales the widget down (`mountWidget`). The
       ring marks focus inside the widget, which the frame clips. -->
  <div
    bind:this={frame}
    class="max-w-full min-w-0 overflow-hidden rounded-sm focus-within:ring-3 focus-within:ring-ring/50"
  >
    <div bind:this={element}></div>
  </div>
  {#if failed}<p role="alert" class="text-sm text-destructive">
      {i18n.m.errorCaptchaRequired}
    </p>{/if}
{/if}
