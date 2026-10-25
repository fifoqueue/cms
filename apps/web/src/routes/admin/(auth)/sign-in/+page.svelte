<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import { CircleCheck } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import SignInStep from '#lib/security/SignInStep.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const title = $derived(
    data.flow === 'setup' ? m.signInSetupTitle : m.signInTitle,
  );
  const done = $derived(!!form && 'done' in form);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<AuthShell
  {title}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
>
  {#if done}
    <Alert role="status">
      <CircleCheck aria-hidden="true" />
      <AlertTitle>{m.signInSetupDone}</AlertTitle>
    </Alert>
    <Button href={resolve(data.loginPath as Path)} class="w-full"
      >{m.signIn}</Button
    >
  {:else if !data.step}
    {#if form && 'message' in form && !('expired' in form)}
      <FormMessage {form} />
    {/if}
    <Alert variant="destructive"
      ><AlertTitle
        >{data.flow === 'setup'
          ? m.signInSetupExpired
          : m.ssoRequestExpired}</AlertTitle
      ></Alert
    >
    <Button
      href={resolve(data.loginPath as Path)}
      variant="outline"
      class="w-full">{m.ssoBackToSignIn}</Button
    >
  {:else}
    <FormMessage {form} />
    <SignInStep
      step={data.step}
      actions={{
        continue: '?/continue',
        factor: '?/factor',
        cancel: '?/cancel',
      }}
      captcha={data.captcha ?? undefined}
      result={form && 'values' in form ? form : null}
    />
  {/if}
</AuthShell>
