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
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Single sign-on</title></svelte:head>

<Card>
  <CardHeader><CardTitle>Single sign-on</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    <FormMessage form={data} />

    {#if data.back === 'account'}
      <Button
        href={resolve('/admin/(app)/account')}
        variant="outline"
        class="w-full"
      >
        Back to account
      </Button>
    {:else}
      <Button
        href={resolve('/admin/(auth)/login')}
        variant="outline"
        class="w-full"
      >
        Back to sign in
      </Button>
    {/if}
  </CardContent>
</Card>
