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
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.settingsSso}</title></svelte:head>

<Card>
  <CardHeader><CardTitle>{m.settingsSso}</CardTitle></CardHeader>
  <CardContent class="space-y-4">
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
        href={resolve('/admin/(auth)/login')}
        variant="outline"
        class="w-full"
      >
        {m.ssoBackToSignIn}
      </Button>
    {/if}
  </CardContent>
</Card>
