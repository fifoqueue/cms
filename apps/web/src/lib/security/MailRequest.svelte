<script lang="ts">
  import type { Path } from '$app/types';
  import type { PublicCaptcha } from '@cms/sdk';
  import { MailCheck } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthForm from '#lib/security/AuthForm.svelte';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import Captcha from '#lib/security/Captcha.svelte';

  interface Result {
    message?: string;
    code?: string;
    issues?: unknown;
    notice?: string;
    captcha?: boolean;
    email?: string;
    sent?: boolean;
  }

  /**
   * A screen that emails a link to the address it asks for (password reset, registration) and
   * confirms once it is sent. The API protects both as password resets.
   */
  let {
    title,
    description,
    sentTitle,
    closed,
    submit,
    maxlength,
    captcha,
    siteTitle,
    privacyPolicy,
    loginPath,
    form,
    children,
  }: {
    title: string;
    description: string;
    sentTitle: string;
    /** Shown instead of the form when the screen does not accept requests. */
    closed?: string;
    submit: string;
    /** Of the address field. */
    maxlength?: number;
    captcha: PublicCaptcha;
    siteTitle?: string | null;
    privacyPolicy?: { title: string; path: string } | null;
    loginPath: string;
    form?: Result | null;
    /** Fields before the address. */
    children?: Snippet;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const sent = $derived(!!form && 'sent' in form);
  const showCaptcha = $derived(
    captcha.provider !== 'none' &&
      (captcha.always.includes('passwordReset') || form?.captcha === true),
  );
</script>

<AuthShell
  {title}
  description={!sent && !closed ? description : undefined}
  {siteTitle}
  {privacyPolicy}
  links={[{ href: loginPath as Path, label: m.backToSignIn }]}
>
  {#if sent}
    <Alert role="status">
      <MailCheck aria-hidden="true" />
      <AlertTitle>{sentTitle}</AlertTitle>
    </Alert>
  {:else if closed}
    <Alert role="status"><AlertTitle>{closed}</AlertTitle></Alert>
  {:else}
    <FormMessage {form} />
    <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
    <AuthForm {submit}>
      {@render children?.()}
      <div class="grid gap-2">
        <Label for="email">{m.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          required
          {maxlength}
          value={form?.email ?? ''}
        />
      </div>
      {#if showCaptcha}
        <Captcha {captcha} />
      {/if}
    </AuthForm>
  {/if}
</AuthShell>
