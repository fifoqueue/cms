<script lang="ts">
  import { resolve } from '$app/paths';
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
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const showCaptcha = $derived(
    data.captcha.provider !== 'none' &&
      (data.captcha.always.includes('login') ||
        (!!form && 'captcha' in form && form.captcha === true)),
  );
</script>

<svelte:head><title>{m.signInTitle}</title></svelte:head>

<Card>
  <CardHeader><CardTitle>{m.signInTitle}</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    <FormMessage {form} />

    {#if data.sso.enabled && data.sso.name}
      <form method="POST" action="?/sso">
        <Button type="submit" variant="outline" class="w-full">
          {m.signInWith(data.sso.name)}
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
      <input type="hidden" name="redirect_to" value={data.back} />
      <div class="grid gap-2">
        <Label for="email">{m.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autocomplete="username"
          required
          value={form && 'email' in form ? form.email : ''}
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
        <Captcha captcha={data.captcha} />
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

{#if data.membership.enabled}<a
    href={resolve('/admin/(auth)/register')}
    class="block text-center underline">{m.registerTitle}</a
  >{/if}
