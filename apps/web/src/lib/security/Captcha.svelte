<script lang="ts">
  import type { PublicCaptcha } from '@cms/sdk';

  /**
   * The provider's widget. It adds its token to the enclosing form as a hidden field, so forms
   * using it submit without `enhance` and the widget renders fresh after each attempt.
   */
  let { captcha }: { captcha: PublicCaptcha } = $props();

  const widgets = {
    turnstile: {
      script: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
      class: 'cf-turnstile',
    },
    hcaptcha: {
      script: 'https://js.hcaptcha.com/1/api.js',
      class: 'h-captcha',
    },
    recaptcha: {
      script: 'https://www.google.com/recaptcha/api.js',
      class: 'g-recaptcha',
    },
  } as const;

  const widget = $derived(
    captcha.provider === 'none' ? null : widgets[captcha.provider],
  );
</script>

<svelte:head>
  {#if widget}
    <script src={widget.script} async defer></script>
  {/if}
</svelte:head>

{#if widget}
  <div class={widget.class} data-sitekey={captcha.siteKey}></div>
{/if}
