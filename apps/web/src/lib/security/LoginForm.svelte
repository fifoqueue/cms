<script lang="ts">
  import { onMount } from 'svelte';
  import type { PublicCaptcha, SsoInfo } from '@cms/sdk';
  import { clearBackups } from '#lib/admin/editor-backup.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { Separator } from '#lib/components/ui/separator/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthForm from '#lib/security/AuthForm.svelte';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import Captcha from '#lib/security/Captcha.svelte';
  import PasswordInput from '#lib/security/PasswordInput.svelte';

  interface Result {
    message?: string;
    code?: string;
    issues?: unknown;
    notice?: string;
    captcha?: boolean;
    email?: string;
    back?: string;
  }

  let {
    sso,
    captcha,
    membership,
    back,
    signedOut,
    privacyPolicy,
    siteTitle,
    form,
  }: {
    sso: SsoInfo;
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
  const showCaptcha = $derived(
    captcha.provider !== 'none' &&
      (captcha.always.includes('login') || result?.captcha === true),
  );

  onMount(() => {
    if (signedOut) clearBackups();
  });
</script>

<AuthShell
  title={m.signInTitle}
  {siteTitle}
  {privacyPolicy}
  links={[
    { href: '/admin/forgot-password', label: m.forgotPassword },
    ...(membership.enabled
      ? [{ href: '/admin/register' as const, label: m.registerTitle }]
      : []),
  ]}
>
  <FormMessage form={result} />

  {#if sso.enabled && sso.name}
    <AuthForm action="?/sso" submit={m.signInWith(sso.name)} variant="outline">
      <input type="hidden" name="redirect_to" value={result?.back ?? back} />
    </AuthForm>

    <div class="flex items-center gap-3 text-xs text-muted-foreground">
      <Separator class="flex-1" />
      {m.or}
      <Separator class="flex-1" />
    </div>
  {/if}

  <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
  <AuthForm action="?/login" submit={m.signIn}>
    <input type="hidden" name="redirect_to" value={result?.back ?? back} />
    <div class="grid gap-2">
      <Label for="email">{m.email}</Label>
      <Input
        id="email"
        name="email"
        type="email"
        autocomplete="username"
        required
        value={result?.email ?? ''}
      />
    </div>
    <div class="grid gap-2">
      <Label for="password">{m.password}</Label>
      <PasswordInput
        id="password"
        name="password"
        autocomplete="current-password"
        required
      />
    </div>
    {#if showCaptcha}
      <Captcha {captcha} />
    {/if}
  </AuthForm>
</AuthShell>
