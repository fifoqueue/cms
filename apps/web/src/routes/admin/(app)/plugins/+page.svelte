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
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const update = $derived(form && 'update' in form ? form.update : null);

  const STATUS: Record<PluginStatus, BadgeVariant> = {
    active: 'default',
    inactive: 'secondary',
    failed: 'destructive',
  };
  const statusNames = $derived<Record<PluginStatus, string>>({
    active: m.pluginStatusActive,
    inactive: m.pluginStatusInactive,
    failed: m.pluginStatusFailed,
  });

  const confirmRemove: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.pluginRemoveConfirm)) cancel();
  };
</script>

<svelte:head><title>{m.navPlugins}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.navPlugins}</h1>
<FormMessage {form} />

<Card>
  <CardHeader>
    <CardTitle>{m.pluginsInstall}</CardTitle>
    <CardDescription>
      {m.pluginsInstallHelp}
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
      <Button type="submit"><Upload class="size-4" /> {m.mediaUpload}</Button>
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
        <Badge variant={STATUS[plugin.status]}
          >{statusNames[plugin.status]}</Badge
        >
      </CardTitle>
      <CardDescription>{plugin.description || plugin.id}</CardDescription>
      <CardAction class="flex gap-2">
        {#if plugin.updatable}
          <form method="POST" action="?/update" use:enhance>
            <input type="hidden" name="id" value={plugin.id} />
            <Button type="submit" variant="ghost" size="sm"
              >{m.pluginCheckUpdate}</Button
            >
          </form>
        {/if}
        <form
          method="POST"
          action={plugin.enabled ? '?/disable' : '?/enable'}
          use:enhance
        >
          <input type="hidden" name="id" value={plugin.id} />
          <Button type="submit" variant="outline" size="sm"
            >{plugin.enabled ? m.pluginDisable : m.pluginEnable}</Button
          >
        </form>
        <form method="POST" action="?/remove" use:enhance={confirmRemove}>
          <input type="hidden" name="id" value={plugin.id} />
          <Button type="submit" variant="destructive" size="sm"
            >{m.remove}</Button
          >
        </form>
      </CardAction>
    </CardHeader>
    {#if update?.id === plugin.id}
      <CardContent class="text-sm">
        {#if update.newer}
          {m.pluginUpdateAvailable(update.latest)}
          {#if update.download}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- the plugin's own download address -->
            <a href={update.download} rel="noopener" class="underline"
              >{m.pluginDownload}</a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          {/if}
        {:else}
          {m.pluginUpToDate}
        {/if}
      </CardContent>
    {/if}
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
  <p class="text-muted-foreground">{m.pluginsEmpty}</p>
{/each}
