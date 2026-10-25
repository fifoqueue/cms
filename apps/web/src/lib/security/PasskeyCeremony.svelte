<script lang="ts">
  import {
    browserSupportsWebAuthn,
    startAuthentication,
    startRegistration,
  } from '@simplewebauthn/browser';
  import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
  } from '@simplewebauthn/browser';
  import { default as LoaderCircle } from '@lucide/svelte/icons/loader-circle';
  import { onMount, tick } from 'svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * Runs the WebAuthn ceremony the step asks for in the browser and posts its result as
   * `credential`. Passkeys need scripts; without them the page says so.
   */
  let {
    action,
    ceremony,
    options,
  }: {
    action: string;
    ceremony: 'get' | 'create';
    options: Record<string, unknown>;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let form = $state<HTMLFormElement>();
  let credential = $state('');
  let status = $state<
    'loading' | 'ready' | 'unsupported' | 'running' | 'failed'
  >('loading');

  onMount(() => {
    status = browserSupportsWebAuthn() ? 'ready' : 'unsupported';
  });

  const run = async () => {
    status = 'running';
    try {
      const response =
        ceremony === 'get'
          ? await startAuthentication({
              optionsJSON:
                options as unknown as PublicKeyCredentialRequestOptionsJSON,
            })
          : await startRegistration({
              optionsJSON:
                options as unknown as PublicKeyCredentialCreationOptionsJSON,
            });
      credential = JSON.stringify(response);
      await tick();
      form?.requestSubmit();
    } catch {
      // Cancelled, timed out or refused by the authenticator: the visitor can try again.
      status = 'failed';
    }
  };
</script>

<!-- A page restored from the back/forward cache must not keep a busy button. -->
<svelte:window
  onpageshow={(event) => {
    if (event.persisted && status === 'running') status = 'ready';
  }}
/>

<form method="POST" {action} bind:this={form} class="grid gap-3">
  <input type="hidden" name="credential" value={credential} />
  <Button
    type="button"
    class="w-full"
    disabled={status === 'loading' ||
      status === 'unsupported' ||
      status === 'running'}
    onclick={run}
  >
    {#if status === 'running'}<LoaderCircle
        class="animate-spin"
        aria-hidden="true"
      />{/if}
    {ceremony === 'get' ? m.passkeyUse : m.passkeyCreate}
  </Button>
  <noscript>
    <p class="text-sm text-destructive">{m.passkeyNeedsScripts}</p>
  </noscript>
  {#if status === 'unsupported'}
    <p role="alert" class="text-sm text-destructive">{m.passkeyUnsupported}</p>
  {:else if status === 'failed'}
    <p role="alert" class="text-sm text-destructive">{m.passkeyFailed}</p>
  {/if}
</form>
