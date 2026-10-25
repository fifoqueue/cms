<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import { CircleCheck } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthShell from '#lib/security/AuthShell.svelte';

  /** What a provider's redirect back ended in when it did not lead anywhere else. */
  let {
    data,
  }: {
    data: {
      flow: 'login' | 'setup' | 'enroll' | 'link';
      retry: string;
      expired: boolean;
      done: boolean;
      message?: string;
      code?: string;
      siteTitle?: string | null;
      privacyPolicy?: { title: string; path: string } | null;
    };
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const toAccount = $derived(data.flow === 'link' || data.flow === 'enroll');
</script>

<svelte:head>
  <title>{m.signInTitle}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<AuthShell
  title={m.signInTitle}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
>
  {#if data.done}
    <Alert role="status">
      <CircleCheck aria-hidden="true" />
      <AlertTitle>{m.signInSetupDone}</AlertTitle>
    </Alert>
  {:else if data.expired}
    <Alert variant="destructive"
      ><AlertTitle>{m.ssoRequestExpired}</AlertTitle></Alert
    >
  {:else}
    <FormMessage form={data} />
  {/if}
  {#if data.flow === 'setup' && !data.done}
    <p class="text-sm text-muted-foreground">{m.ssoClaimRetry}</p>
  {/if}

  {#if toAccount}
    <Button
      href={resolve('/admin/(app)/account')}
      variant="outline"
      class="w-full"
    >
      {m.ssoBackToAccount}
    </Button>
  {:else}
    <Button
      href={resolve(data.retry as Path)}
      variant={data.done ? 'default' : 'outline'}
      class="w-full"
    >
      {data.done ? m.signIn : m.ssoBackToSignIn}
    </Button>
  {/if}
</AuthShell>
