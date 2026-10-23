<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import type { PublicCaptcha, SsoInfo } from '@cms/sdk';
  import { clearBackups } from '#lib/admin/editor-backup.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { Separator } from '#lib/components/ui/separator/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import Captcha from '#lib/security/Captcha.svelte';
  import PrivacyPolicyLink from '#lib/theme/PrivacyPolicyLink.svelte';

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
    form,
  }: {
    sso: SsoInfo;
    captcha: PublicCaptcha;
    membership: { enabled: boolean };
    back: string;
    signedOut: boolean;
    privacyPolicy?: { title: string; path: string } | null;
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

<Card>
  <CardHeader><CardTitle>{m.signInTitle}</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    <FormMessage form={result} />

    {#if sso.enabled && sso.name}
      <form method="POST" action="?/sso">
        <input type="hidden" name="redirect_to" value={result?.back ?? back} />
        <Button type="submit" variant="outline" class="w-full">
          {m.signInWith(sso.name)}
        </Button>
      </form>

      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator class="flex-1" />
        {m.or}
        <Separator class="flex-1" />
      </div>
    {/if}

    <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
    <form method="POST" action="?/login" class="space-y-4">
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
        <Input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      {#if showCaptcha}
        <Captcha {captcha} />
      {/if}
      <Button type="submit" class="w-full">{m.signIn}</Button>
    </form>
    <p class="text-center text-sm">
      <a
        href={resolve('/admin/(auth)/forgot-password')}
        class="text-muted-foreground hover:underline">{m.forgotPassword}</a
      >
    </p>
  </CardContent>
</Card>

{#if membership.enabled}<a
    href={resolve('/admin/(auth)/register')}
    class="block text-center underline">{m.registerTitle}</a
  >{/if}

{#if privacyPolicy}
  <div class="mt-4 text-center">
    <PrivacyPolicyLink policy={privacyPolicy} />
  </div>
{/if}
