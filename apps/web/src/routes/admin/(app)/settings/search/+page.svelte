<script lang="ts">
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const settings = $derived(data.settings);
  const status = $derived(data.status);
  const stateNames = $derived({
    disabled: m.searchStateDisabled,
    building: m.searchStateBuilding,
    syncing: m.searchStateSyncing,
    ready: m.searchStateReady,
    failing: m.searchStateFailing,
  });
</script>

<svelte:head><title>{m.settingsSearch}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.searchStatus}</CardTitle></CardHeader>
  <CardContent class="grid gap-3 text-sm">
    <p>
      <Badge variant={status.engine === 'meilisearch' ? 'default' : 'secondary'}
        >{status.engine === 'meilisearch'
          ? m.searchEngineIndex
          : m.searchEngineDatabase}</Badge
      >
      {stateNames[status.state]}
    </p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      <dt class="text-muted-foreground">{m.searchPending}</dt>
      <dd>{status.pending}</dd>
      <dt class="text-muted-foreground">{m.searchDocuments}</dt>
      <dd>{status.documents ?? '—'}</dd>
      <dt class="text-muted-foreground">{m.searchLastSync}</dt>
      <dd>
        {status.lastSyncAt
          ? new Date(status.lastSyncAt).toLocaleString(i18n.language)
          : '—'}
      </dd>
    </dl>
    {#if status.lastError}
      <p class="text-destructive" role="alert">{status.lastError}</p>
    {/if}
    <div class="flex flex-wrap gap-2">
      <form method="POST" action="?/test" use:enhance>
        <Button type="submit" variant="outline" size="sm">{m.searchTest}</Button
        >
      </form>
      <form method="POST" action="?/reindex" use:enhance>
        <Button type="submit" variant="outline" size="sm"
          >{m.searchReindex}</Button
        >
      </form>
    </div>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.settingsSearch}</CardTitle></CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/save"
      use:enhance={() =>
        ({ update }) =>
          update({ reset: false })}
      class="grid gap-4 sm:grid-cols-2"
    >
      <label class="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="enabled" checked={settings.enabled} />
        {m.searchEnabled}
      </label>
      <div class="grid gap-2">
        <Label for="host">{m.searchHost}</Label>
        <Input
          id="host"
          name="host"
          maxlength={500}
          placeholder="http://127.0.0.1:7700"
          value={settings.host}
        />
      </div>
      <div class="grid gap-2">
        <Label for="indexPrefix">{m.searchIndexPrefix}</Label>
        <Input
          id="indexPrefix"
          name="indexPrefix"
          maxlength={40}
          pattern="[a-z0-9_]+"
          value={settings.indexPrefix}
        />
      </div>
      <div class="grid gap-2 sm:col-span-2">
        <Label for="apiKey">{m.searchApiKey}</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          autocomplete="off"
          placeholder={settings.apiKeyConfigured ? '••••••••' : ''}
        />
        {#if settings.apiKeyConfigured}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" name="removeApiKey" />
            {m.searchRemoveApiKey}
          </label>
        {/if}
      </div>
      <p class="text-sm text-muted-foreground sm:col-span-2">
        {m.searchFallbackHelp}
      </p>
      <div><Button type="submit">{m.save}</Button></div>
    </form>
  </CardContent>
</Card>
