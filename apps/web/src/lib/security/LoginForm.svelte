<script lang="ts">
  import { onMount } from 'svelte';
  import type { PublicCaptcha } from '@cms/sdk';
  import { clearBackups } from '#lib/admin/editor-backup.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthForm from '#lib/security/AuthForm.svelte';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import Captcha from '#lib/security/Captcha.svelte';
  import SignInMethods from '#lib/security/SignInMethods.svelte';
  import type { MethodView } from '#lib/server/sign-in-view.js';

  interface Result {
    message?: string;
    code?: string;
    issues?: unknown;
    notice?: string;
    captcha?: boolean;
    email?: string;
    back?: string;
    /** The method of the refused attempt and what was typed into it. */
    method?: string;
    values?: Record<string, string>;
    /** The refused attempt used a recovery code. */
    recovery?: boolean;
  }

  let {
    signIn,
    captcha,
    membership,
    back,
    signedOut,
    privacyPolicy,
    siteTitle,
    form,
  }: {
    signIn: { methods: MethodView[]; passwordReset: boolean };
    captcha: PublicCaptcha;
    membership: { enabled: boolean };
    back: string;
    signedOut: boolean;
    privacyPolicy?: { title: string; path: string } | null;
    siteTitle?: string | null;
    form?: unknown;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const result = $derived(
    form && typeof form === 'object' ? (form as Result) : null,
  );
  const captchaAlways = $derived(captcha.always.includes('login'));
  const showCaptcha = $derived(
    captcha.provider !== 'none' &&
      (captchaAlways || (result?.captcha === true && result.recovery === true)),
  );

  onMount(() => {
    if (signedOut) clearBackups();
  });
</script>

{#snippet hidden()}
  <input type="hidden" name="redirect_to" value={result?.back ?? back} />
{/snippet}

<AuthShell
  title={m.signInTitle}
  {siteTitle}
  {privacyPolicy}
  links={[
    ...(signIn.passwordReset
      ? [{ href: '/admin/forgot-password' as const, label: m.forgotPassword }]
      : []),
    ...(membership.enabled
      ? [{ href: '/admin/register' as const, label: m.registerTitle }]
      : []),
  ]}
>
  <FormMessage form={result} />

  {#if !signIn.methods.length}
    <p class="text-sm text-muted-foreground">{m.signInNoMethods}</p>
  {/if}
  <SignInMethods
    methods={signIn.methods}
    action="?/signIn"
    submit={m.signIn}
    buttonLabel={m.signInWith}
    {captcha}
    {captchaAlways}
    result={result?.recovery ? null : result}
    {hidden}
  />

  <!-- A way back in for administrators. Opens without scripts; open after a refused code or
  when nothing else signs in. -->
  <details
    class="text-sm"
    open={result?.recovery === true || !signIn.methods.length}
  >
    <summary
      class="cursor-pointer rounded-sm text-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >{m.recoverySignIn}</summary
    >
    <div class="mt-4">
      <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
      <AuthForm action="?/recover" submit={m.signIn}>
        <input type="hidden" name="redirect_to" value={result?.back ?? back} />
        <div class="grid gap-2">
          <Label for="recovery-email">{m.email}</Label>
          <Input
            id="recovery-email"
            name="email"
            type="email"
            autocomplete="username"
            required
            value={result?.email ?? ''}
          />
        </div>
        <div class="grid gap-2">
          <Label for="recovery-code">{m.recoveryCode}</Label>
          <Input
            id="recovery-code"
            name="code"
            autocomplete="one-time-code"
            autocapitalize="off"
            spellcheck={false}
            maxlength={64}
            required
            aria-describedby="recovery-code-help"
          />
          <p id="recovery-code-help" class="text-xs text-muted-foreground">
            {m.recoveryCodeHelp}
          </p>
        </div>
        {#if showCaptcha}
          <Captcha {captcha} />
        {/if}
      </AuthForm>
    </div>
  </details>
</AuthShell>
