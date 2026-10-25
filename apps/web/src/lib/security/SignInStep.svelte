<script lang="ts">
  import type { PublicCaptcha } from '@cms/sdk';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthForm from '#lib/security/AuthForm.svelte';
  import Captcha from '#lib/security/Captcha.svelte';
  import PasskeyCeremony from '#lib/security/PasskeyCeremony.svelte';
  import SignInDisplay from '#lib/security/SignInDisplay.svelte';
  import SignInFields from '#lib/security/SignInFields.svelte';
  import SsoButtons from '#lib/security/SsoButtons.svelte';
  import type { StepView } from '#lib/server/sign-in-view.js';
  import { factorLabel } from '#lib/sign-in-labels.js';

  /**
   * The next step of a sign-in, setup or enrollment, whichever method or factor asks for it:
   * fields to fill in, a passkey ceremony, or a choice of second factor.
   */
  let {
    step,
    actions,
    captcha,
    result,
    cancelLabel,
  }: {
    step: StepView;
    /** The give-up button; "start over" unless given. */
    cancelLabel?: string;
    /** Form actions answering the step, choosing a factor and giving up. */
    actions: { continue: string; factor: string; cancel: string };
    captcha?: PublicCaptcha;
    result?: { captcha?: boolean; values?: Record<string, string> } | null;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

{#if step.kind === 'fields'}
  {#if step.message}<p class="text-sm">{step.message}</p>{/if}
  <SignInDisplay display={step.display} />
  <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
  <AuthForm action={actions.continue} submit={m.signInContinue}>
    <SignInFields fields={step.fields} prefix="step" values={result?.values} />
    {#if captcha && captcha.provider !== 'none' && result?.captcha}
      <Captcha {captcha} />
    {/if}
  </AuthForm>
{:else if step.kind === 'webauthn'}
  <p class="text-sm text-muted-foreground">
    {step.ceremony === 'get' ? m.passkeyUseHelp : m.passkeyCreateHelp}
  </p>
  <SignInDisplay display={step.display} />
  <PasskeyCeremony
    action={actions.continue}
    ceremony={step.ceremony}
    options={step.options}
  />
{:else}
  <p class="text-sm text-muted-foreground">
    {step.purpose === 'enroll' ? m.signInEnrollChoose : m.signInFactorChoose}
  </p>
  <SsoButtons
    action={actions.factor}
    name="factor"
    options={step.factors.map((factor) => ({
      id: factor.id,
      label: factorLabel(m, factor),
    }))}
  />
{/if}

<form method="POST" action={actions.cancel} class="text-center">
  <Button type="submit" variant="link" size="sm"
    >{cancelLabel ?? m.signInCancel}</Button
  >
</form>
