<script lang="ts">
  import { enhance } from '$app/forms';
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
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Sign in</title></svelte:head>

<Card>
  <CardHeader><CardTitle>Sign in</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    <FormMessage {form} />

    {#if data.sso.enabled}
      <form method="POST" action="?/sso">
        <Button type="submit" variant="outline" class="w-full">
          Sign in with {data.sso.name}
        </Button>
      </form>

      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator class="flex-1" />
        or
        <Separator class="flex-1" />
      </div>
    {/if}

    <form method="POST" action="?/login" use:enhance class="space-y-4">
      <div class="grid gap-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autocomplete="username"
          required
        />
      </div>
      <div class="grid gap-2">
        <Label for="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <Button type="submit" class="w-full">Sign in</Button>
    </form>
  </CardContent>
</Card>
