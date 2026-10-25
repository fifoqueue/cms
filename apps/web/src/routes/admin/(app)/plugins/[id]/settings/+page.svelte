<script lang="ts">
  import { resolve } from '$app/paths';
  import { default as ArrowLeft } from '@lucide/svelte/icons/arrow-left';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import PluginSettingsForm from '#lib/admin/PluginSettingsForm.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Card, CardContent } from '#lib/components/ui/card/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.pluginSettingsOf(data.plugin.name)}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-4">
  <h1 class="text-2xl font-semibold">
    {m.pluginSettingsOf(data.plugin.name)}
    <span class="text-sm font-normal text-muted-foreground"
      >{data.plugin.version}</span
    >
  </h1>
  <Button href={resolve('/admin/(app)/plugins')} variant="outline"
    ><ArrowLeft class="size-4" /> {m.navPlugins}</Button
  >
</div>

<FormMessage {form} />

<Card>
  <CardContent class="pt-6">
    {#if data.plugin.settings.length}
      <PluginSettingsForm plugin={data.plugin} />
    {:else}
      <p class="text-sm text-muted-foreground">{m.pluginNoSettings}</p>
    {/if}
  </CardContent>
</Card>
