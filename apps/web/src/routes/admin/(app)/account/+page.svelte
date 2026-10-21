<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const identity = $derived(data.status.identity);

  const confirmUnlink: SubmitFunction = ({ cancel }) => {
    if (!confirm('Stop signing in with this single sign-on account?')) cancel();
  };
</script>

<svelte:head><title>Account</title></svelte:head>

<h1 class="text-2xl font-semibold">Account</h1>
<FormMessage {form} />

<Card>
  <CardHeader>
    <CardTitle>Profile</CardTitle>
  </CardHeader>
  <CardContent>
    <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt class="text-muted-foreground">Name</dt>
      <dd>{data.user.name}</dd>
      <dt class="text-muted-foreground">Email</dt>
      <dd>{data.user.email}</dd>
    </dl>
  </CardContent>
</Card>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      Single sign-on
      {#if identity}
        <Badge>Linked</Badge>
      {:else}
        <Badge variant="secondary">Not linked</Badge>
      {/if}
    </CardTitle>
    <CardDescription>
      {#if data.sso.enabled}
        Link an account at {data.sso.name} to sign in to this account with it. Your
        password keeps working.
      {:else}
        Single sign-on is not available on this site.
      {/if}
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if identity}
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Provider</dt>
        <dd class="break-all">{identity.issuer}</dd>
        <dt class="text-muted-foreground">Account ID</dt>
        <dd class="break-all">{identity.subject}</dd>
        <dt class="text-muted-foreground">Linked</dt>
        <dd>{new Date(identity.linkedAt).toLocaleString()}</dd>
      </dl>
    {/if}

    {#if data.status.assigned}
      <p class="text-sm text-muted-foreground">
        The site operator has also assigned a single sign-on account to you.
      </p>
    {/if}

    <div class="flex flex-wrap gap-2">
      {#if data.sso.enabled}
        <!-- Not enhanced: the browser has to follow the redirect to the provider. -->
        <form method="POST" action="?/link">
          <Button type="submit" variant="outline">
            {identity ? 'Link a different account' : `Link ${data.sso.name}`}
          </Button>
        </form>
      {/if}

      {#if identity}
        <form method="POST" action="?/unlink" use:enhance={confirmUnlink}>
          <Button type="submit" variant="destructive">Unlink</Button>
        </form>
      {/if}
    </div>
  </CardContent>
</Card>
