<script lang="ts">
  import type { PublicCaptcha } from '@cms/sdk';
  import { onMount } from 'svelte';
  import { useI18n } from '#lib/i18n/index.js';

  interface WidgetApi {
    render(
      element: HTMLElement,
      options: Record<string, unknown>,
    ): string | number;
    reset(id: string | number): void;
    remove?(id: string | number): void;
    ready?(callback: () => void): void;
  }

  let {
    captcha,
    onchange,
  }: {
    captcha: PublicCaptcha;
    onchange?: (ready: boolean) => void;
  } = $props();
  const i18n = useI18n();
  let element = $state<HTMLDivElement>();
  let api: WidgetApi | undefined;
  let id: string | number | undefined;
  let token = $state('');
  let failed = $state(false);

  const widgets = {
    turnstile: {
      script:
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      field: 'cf-turnstile-response',
    },
    hcaptcha: {
      script: 'https://js.hcaptcha.com/1/api.js?render=explicit',
      field: 'h-captcha-response',
    },
    recaptcha: {
      script: 'https://www.google.com/recaptcha/api.js?render=explicit',
      field: 'g-recaptcha-response',
    },
  } as const;

  const widget = $derived(
    captcha.provider === 'none' ? null : widgets[captcha.provider],
  );

  const clear = () => {
    token = '';
    onchange?.(false);
  };
  const loadError = () => {
    clear();
    failed = true;
  };

  /** Captcha tokens are single-use, including attempts rejected for another reason. */
  export function reset() {
    clear();
    if (id !== undefined) {
      try {
        api?.reset(id);
      } catch {
        failed = true;
      }
    }
  }

  onMount(() => {
    if (!widget) return;
    let active = true;
    let rendering = false;
    const timer = setInterval(() => {
      if (rendering || id !== undefined) return;
      const providers = window as unknown as {
        turnstile?: WidgetApi;
        hcaptcha?: WidgetApi;
        grecaptcha?: WidgetApi;
      };
      api =
        captcha.provider === 'turnstile'
          ? providers.turnstile
          : captcha.provider === 'hcaptcha'
            ? providers.hcaptcha
            : providers.grecaptcha;
      if (!api?.render) return;
      rendering = true;
      const render = () => {
        if (!active) return;
        try {
          id = api!.render(element!, {
            sitekey: captcha.siteKey,
            'response-field': false,
            callback: (value: string) => {
              if (!active) return;
              token = value;
              failed = false;
              onchange?.(!!value);
            },
            'expired-callback': clear,
            'error-callback': loadError,
          });
          clearInterval(timer);
        } catch {
          rendering = false;
          failed = true;
        }
      };
      if (api.ready) api.ready(render);
      else render();
    }, 100);
    return () => {
      active = false;
      clearInterval(timer);
      clear();
      if (id !== undefined) {
        try {
          if (api?.remove) api.remove(id);
          else api?.reset(id);
        } catch {
          /* The provider may already have removed its widget. */
        }
      }
    };
  });
</script>

<svelte:head>
  {#if widget}
    <script src={widget.script} async defer onerror={loadError}></script>
  {/if}
</svelte:head>

{#if widget}
  <!-- First field wins even when a provider also creates its own response field. -->
  <input type="hidden" name={widget.field} value={token} />
  <div bind:this={element}></div>
  {#if failed}<p role="alert" class="text-sm text-destructive">
      {i18n.m.errorCaptchaRequired}
    </p>{/if}
{/if}
