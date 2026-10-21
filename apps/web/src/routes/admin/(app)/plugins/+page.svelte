<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import type { PluginStatus } from '@cms/sdk';
  import { Upload } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import PluginSettingsForm from '#lib/admin/PluginSettingsForm.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import type { BadgeVariant } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Separator } from '#lib/components/ui/separator/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const STATUS: Record<PluginStatus, BadgeVariant> = {
    active: 'default',
    inactive: 'secondary',
    failed: 'destructive',
  };

  const confirmRemove: SubmitFunction = ({ cancel }) => {
    if (!confirm('Remove this plugin and delete its settings and data?'))
      cancel();
  };
</script>

<svelte:head><title>Plugins</title></svelte:head>

<h1 class="text-2xl font-semibold">Plugins</h1>
<FormMessage {form} />

<Card>
  <CardHeader>
    <CardTitle>Install or upgrade</CardTitle>
    <CardDescription>
      Upload a plugin bundle (a single ES module). Uploading a plugin with an
      existing id upgrades it in place.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/install"
      enctype="multipart/form-data"
      use:enhance
      class="flex flex-wrap gap-2"
    >
      <Input
        name="bundle"
        type="file"
        accept=".js,.mjs,text/javascript"
        required
        class="max-w-sm"
      />
      <Button type="submit"><Upload class="size-4" /> Upload</Button>
    </form>
  </CardContent>
</Card>

{#each data.plugins as plugin (plugin.id)}
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        {plugin.name}
        <span class="text-sm font-normal text-muted-foreground"
          >{plugin.version}</span
        >
        <Badge variant={STATUS[plugin.status]}>{plugin.status}</Badge>
      </CardTitle>
      <CardDescription>{plugin.description || plugin.id}</CardDescription>
      <CardAction class="flex gap-2">
        <form
          method="POST"
          action={plugin.enabled ? '?/disable' : '?/enable'}
          use:enhance
        >
          <input type="hidden" name="id" value={plugin.id} />
          <Button type="submit" variant="outline" size="sm"
            >{plugin.enabled ? 'Disable' : 'Enable'}</Button
          >
        </form>
        <form method="POST" action="?/remove" use:enhance={confirmRemove}>
          <input type="hidden" name="id" value={plugin.id} />
          <Button type="submit" variant="destructive" size="sm">Remove</Button>
        </form>
      </CardAction>
    </CardHeader>
    {#if plugin.error || plugin.settings.length}
      <CardContent class="space-y-4">
        {#if plugin.error}<p class="text-sm text-destructive">
            {plugin.error}
          </p>{/if}
        {#if plugin.settings.length}
          <Separator />
          <PluginSettingsForm {plugin} />
        {/if}
      </CardContent>
    {/if}
  </Card>
{:else}
  <p class="text-muted-foreground">No plugins installed.</p>
{/each}
