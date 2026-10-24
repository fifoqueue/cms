<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.settingsSso}</title></svelte:head>

<AuthShell
  title={m.settingsSso}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
>
  <FormMessage form={data} />

  {#if data.back === 'account'}
    <Button
      href={resolve('/admin/(app)/account')}
      variant="outline"
      class="w-full"
    >
      {m.ssoBackToAccount}
    </Button>
  {:else}
    <Button
      href={resolve(
        (data.returnTo
          ? `${data.loginPath}?${new URLSearchParams({ redirect_to: data.returnTo })}`
          : data.loginPath) as Path,
      )}
      variant="outline"
      class="w-full"
    >
      {m.ssoBackToSignIn}
    </Button>
  {/if}
</AuthShell>
