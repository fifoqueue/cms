<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head>
  <title>{m.passwordTitle}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<Card>
  <CardHeader><CardTitle>{m.passwordTitle}</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    {#if form && 'done' in form}
      <Alert><AlertTitle>{m.passwordSaved}</AlertTitle></Alert>
    {:else}
      <FormMessage {form} />
      <form method="POST" use:enhance class="space-y-4">
        <input type="hidden" name="token" value={data.token} />
        <div class="grid gap-2">
          <Label for="password">{m.newPassword}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autocomplete="new-password"
            minlength={8}
            maxlength={200}
            required
          />
        </div>
        <Button type="submit" class="w-full">{m.save}</Button>
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
