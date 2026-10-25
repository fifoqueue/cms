<script lang="ts">
  import { listQuery } from '#lib/admin/list-query.js';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { PluginStatus } from '@cms/sdk';
  import { default as Search } from '@lucide/svelte/icons/search';
  import { default as Upload } from '@lucide/svelte/icons/upload';
  import BulkReport from '#lib/admin/BulkReport.svelte';
  import { catalogMessage } from '#lib/admin/form-errors.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
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
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
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

  const views = ['active', 'inactive', 'failed'] as const;
  /** A view link keeping the search. */
  const view = (status?: string): `?${string}` =>
    listQuery(
      { status: status || undefined, q: data.filter.q || undefined },
      {},
    );

  let selected = $state<string[]>([]);
  const ids = $derived(data.plugins.map((plugin) => plugin.id));
  const names = $derived(
    new Map(data.plugins.map((plugin) => [plugin.id, plugin.name])),
  );
  const bulkResult = $derived(
    form && 'bulk' in form
      ? (form.bulk as {
          done: number;
          failed: { id: string; message: string }[];
        })
      : null,
  );
  const confirmBulk: SubmitFunction = ({ formData, cancel }) => {
    if (formData.get('action') === 'remove' && !confirm(m.pluginRemoveConfirm))
      return cancel();
    return async ({ update }) => {
      selected = [];
      await update();
    };
  };

  /** Drag-and-drop upload: the dropped bundle goes into the file field and is sent. */
  let dragging = $state(false);
  let installForm: HTMLFormElement;
  let bundleInput: HTMLInputElement | null = $state(null);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    dragging = false;
    const files = event.dataTransfer?.files;
    if (!files?.length || !bundleInput) return;
    bundleInput.files = files;
    installForm.requestSubmit();
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
      bind:this={installForm}
      method="POST"
      action="?/install"
      enctype="multipart/form-data"
      use:enhance
      class="flex flex-wrap items-center gap-2 rounded-md border-2 border-dashed p-4 {dragging
        ? 'border-primary bg-muted'
        : ''}"
      ondragover={(event) => {
        event.preventDefault();
        dragging = true;
      }}
      ondragleave={() => (dragging = false)}
      ondrop={drop}
    >
      <Input
        bind:ref={bundleInput}
        name="bundle"
        type="file"
        accept=".js,.mjs,text/javascript"
        required
        class="max-w-sm"
        aria-label={m.pluginsInstall}
      />
      <Button type="submit"><Upload class="size-4" /> {m.mediaUpload}</Button>
      <span class="text-sm text-muted-foreground">{m.pluginsDropHere}</span>
    </form>
  </CardContent>
</Card>

<BulkReport result={bulkResult} {names} />

<nav class="flex flex-wrap gap-2 text-sm" aria-label={m.columnStatus}>
  <a
    href={resolve(`/admin/(app)/plugins${view()}`)}
    aria-current={!data.filter.status}
    class="filter"
    >{m.anyStatus}
    <span class="text-muted-foreground">({data.counts.all})</span></a
  >
  {#each views as status (status)}
    {#if data.counts[status] || data.filter.status === status}
      <a
        href={resolve(`/admin/(app)/plugins${view(status)}`)}
        aria-current={data.filter.status === status}
        class="filter"
        >{statusNames[status]}
        <span class="text-muted-foreground">({data.counts[status]})</span></a
      >
    {/if}
  {/each}
</nav>

<div class="flex flex-wrap items-center justify-between gap-2">
  <form
    id="bulk-plugins"
    method="POST"
    action="?/bulk"
    use:enhance={confirmBulk}
    class="flex flex-wrap items-center gap-2"
  >
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={ids.length > 0 && selected.length === ids.length}
        onchange={(event) =>
          (selected = event.currentTarget.checked ? ids : [])}
      />
      {m.selectAll}
    </label>
    <label class="sr-only" for="plugins-action">{m.bulkActions}</label>
    <NativeSelect id="plugins-action" name="action" size="sm">
      <NativeSelectOption value="enable">{m.pluginEnable}</NativeSelectOption>
      <NativeSelectOption value="disable">{m.pluginDisable}</NativeSelectOption>
      <NativeSelectOption value="remove">{m.remove}</NativeSelectOption>
    </NativeSelect>
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={!selected.length}>{m.apply}</Button
    >
  </form>
  <form method="GET" role="search" class="flex gap-2" aria-label={m.search}>
    {#if data.filter.status}<input
        type="hidden"
        name="status"
        value={data.filter.status}
      />{/if}
    <Input
      name="q"
      type="search"
      maxlength={200}
      value={data.filter.q ?? ''}
      placeholder={m.pluginsSearch}
      aria-label={m.pluginsSearch}
      class="w-56"
    />
    <Button type="submit" variant="outline"
      ><Search class="size-4" /> {m.search}</Button
    >
  </form>
</div>

{#each data.plugins as plugin (plugin.id)}
  <Card>
    <CardHeader>
      <CardTitle class="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          form="bulk-plugins"
          name="ids"
          value={plugin.id}
          aria-label={m.selectItem(plugin.name)}
          bind:group={selected}
        />
        {plugin.name}
        <span class="text-sm font-normal text-muted-foreground"
          >{plugin.version}</span
        >
        <Badge variant={STATUS[plugin.status]}
          >{statusNames[plugin.status]}</Badge
        >
      </CardTitle>
      <CardDescription>{plugin.description || plugin.id}</CardDescription>
      <CardAction class="flex flex-wrap gap-2">
        {#if plugin.settings.length}
          <Button
            href={resolve('/admin/(app)/plugins/[id]/settings', {
              id: plugin.id,
            })}
            variant="ghost"
            size="sm">{m.pluginSettingsLink}</Button
          >
        {/if}
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
    {#if plugin.error}
      <CardContent>
        <p class="text-sm text-destructive">
          {catalogMessage(m, plugin.error, plugin.errorParams) ?? plugin.error}
        </p>
      </CardContent>
    {/if}
  </Card>
{:else}
  <p class="text-muted-foreground">
    {data.filter.status || data.filter.q ? m.noMatches : m.pluginsEmpty}
  </p>
{/each}

<style>
  .filter {
    border-radius: var(--radius);
    padding: 0.25rem 0.75rem;
  }
  .filter[aria-current='true'] {
    background: var(--muted);
    font-weight: 500;
  }
</style>
