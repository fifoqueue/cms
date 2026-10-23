<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import Captcha from '#lib/security/Captcha.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const showCaptcha = $derived(
    data.captcha.provider !== 'none' &&
      (data.captcha.always.includes('passwordReset') ||
        (!!form && 'captcha' in form && form.captcha === true)),
  );
</script>

<svelte:head><title>{m.registerTitle}</title></svelte:head>

<Card>
  <CardHeader>
    <CardTitle>{m.registerTitle}</CardTitle>
    <CardDescription>{m.registerHelp}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if form && 'sent' in form}
      <Alert><AlertTitle>{m.forgotSent}</AlertTitle></Alert>
    {:else if !data.membership.enabled}
      <p>{m.registrationClosed}</p>
    {:else}
      <FormMessage {form} />
      <form method="POST" class="space-y-4">
        <label class="grid gap-2"
          >{m.name}<Input
            name="name"
            autocomplete="name"
            required
            maxlength={191}
          /></label
        >
        <div class="grid gap-2">
          <Label for="email">{m.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            required
            value={form && 'email' in form ? form.email : ''}
          />
        </div>
        {#if showCaptcha}
          <Captcha captcha={data.captcha} />
        {/if}
        <Button type="submit" class="w-full">{m.registerTitle}</Button>
      </form>
    {/if}
    <p class="text-center text-sm">
      <a
        href={resolve(data.loginPath as Path)}
        class="text-muted-foreground hover:underline">{m.backToSignIn}</a
      >
    </p>
  </CardContent>
</Card>
