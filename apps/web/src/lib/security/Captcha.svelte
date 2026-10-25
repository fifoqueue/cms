<script lang="ts">
  import type { PublicCaptcha } from '@cms/sdk';
  import { onMount } from 'svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import {
    CAPTCHA_TOKEN_FIELD,
    mountWidget,
    widgetAttributes,
    type MountedWidget,
  } from '#lib/security/captcha-widget.js';

  /**
   * The captcha widget the API describes, core or plugin alike: its script, a container with
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
  let element = $state<HTMLDivElement>();
  let tokenInput = $state<HTMLInputElement>();
  let mounted: MountedWidget | undefined;
  let token = $state('');
  let failed = $state(false);

  const widget = $derived(captcha.provider === 'none' ? null : captcha.widget);
  const attributes = $derived(
    widget ? widgetAttributes(widget.attributes) : {},
  );

  const set = (value: string) => {
    token = value;
    // Synchronously too: a submit handler reads the form before the next render.
    if (tokenInput) tokenInput.value = value;
    if (value) failed = false;
    onchange?.(!!value);
  };

  /** Captcha tokens are single-use, including attempts rejected for another reason. */
  export function reset() {
    set('');
    mounted?.reset();
  }

  onMount(() => {
    if (!widget || !element) return;
    mounted = mountWidget(element, widget, captcha.siteKey, {
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
  <div bind:this={element} {...attributes}></div>
  {#if failed}<p role="alert" class="text-sm text-destructive">
      {i18n.m.errorCaptchaRequired}
    </p>{/if}
{/if}
