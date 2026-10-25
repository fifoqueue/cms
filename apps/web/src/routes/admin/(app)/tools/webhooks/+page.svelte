<script lang="ts">
  import { enhance } from '$app/forms';
  import { WEBHOOK_EVENTS } from '@cms/sdk';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { catalogMessage } from '#lib/admin/form-errors.js';
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
  const secret = $derived(form && 'secret' in form ? form.secret : null);
</script>

<svelte:head><title>{m.toolsWebhooks}</title></svelte:head>

<FormMessage {form} />

{#if secret}
  <Card>
    <CardContent class="grid gap-2 pt-6 text-sm">
      <p>{m.webhookSecretHelp}</p>
      <code class="rounded bg-muted p-2 break-all select-all">{secret}</code>
    </CardContent>
  </Card>
{/if}

{#snippet fields(
  prefix: string,
  url: string,
  events: readonly string[],
  enabled: boolean,
)}
  <div class="grid gap-2">
    <Label for="{prefix}-url">{m.webhookUrl}</Label>
    <Input
      id="{prefix}-url"
      name="url"
      type="url"
      required
      maxlength={500}
      placeholder="https://"
      value={url}
    />
  </div>
  <fieldset class="grid gap-1 sm:grid-cols-2">
    <legend class="mb-1 text-sm font-medium">{m.webhookEvents}</legend>
    {#each WEBHOOK_EVENTS as name (name)}
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="events"
          value={name}
          checked={events.includes(name)}
        />
        <code>{name}</code>
      </label>
    {/each}
  </fieldset>
  <label class="flex items-center gap-2 text-sm">
    <input type="checkbox" name="enabled" checked={enabled} />
    {m.webhookEnabled}
  </label>
{/snippet}

{#each data.webhooks as hook (hook.id)}
  <Card>
    <CardHeader>
      <CardTitle class="flex flex-wrap items-center gap-2 text-base">
        <span class="break-all">{hook.url}</span>
        {#if hook.lastStatus !== null || hook.lastError}
          <Badge variant={hook.lastError ? 'destructive' : 'secondary'}
            >{hook.lastStatus ?? '—'}</Badge
          >
        {/if}
      </CardTitle>
      {#if hook.lastError}
        <p class="text-sm text-destructive">
          {catalogMessage(m, hook.lastError) ?? hook.lastError}
        </p>
      {/if}
    </CardHeader>
    <CardContent class="grid gap-4">
      <form
        method="POST"
        action="?/update"
        use:enhance={() =>
          ({ update }) =>
            update({ reset: false })}
        class="grid gap-4"
      >
        <input type="hidden" name="id" value={hook.id} />
        {@render fields(hook.id, hook.url, hook.events, hook.enabled)}
        <div><Button type="submit" size="sm">{m.save}</Button></div>
      </form>
      <div class="flex flex-wrap gap-2">
        {#each [['ping', m.webhookPing], ['rotate', m.webhookRotate], ['remove', m.remove]] as [action, label] (action)}
          <form method="POST" action="?/{action}" use:enhance>
            <input type="hidden" name="id" value={hook.id} />
            <Button
              type="submit"
              size="sm"
              variant={action === 'remove' ? 'destructive' : 'outline'}
              >{label}</Button
            >
          </form>
        {/each}
      </div>
    </CardContent>
  </Card>
{/each}

<Card>
  <CardHeader><CardTitle>{m.webhookAdd}</CardTitle></CardHeader>
  <CardContent>
    <form method="POST" action="?/create" use:enhance class="grid gap-4">
      {@render fields('new', '', [], true)}
      <div><Button type="submit">{m.add}</Button></div>
    </form>
  </CardContent>
</Card>
