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
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const settings = $derived(data.discussion);
  const choices = $derived([
    { value: 'manual', label: m.discussionManual },
    { value: 'known', label: m.discussionKnown },
    { value: 'auto', label: m.discussionAuto },
  ]);
</script>

<svelte:head><title>{m.settingsDiscussion}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.settingsDiscussion}</CardTitle></CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/save"
      use:enhance={() =>
        ({ update }) =>
          update({ reset: false })}
      class="grid gap-6"
    >
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" checked={settings.enabled} />
        {m.discussionEnabled}
      </label>
      <fieldset class="grid gap-2">
        <legend class="mb-2 text-sm font-medium"
          >{m.discussionModeration}</legend
        >
        {#each choices as choice (choice.value)}
          <label class="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="moderation"
              value={choice.value}
              checked={settings.moderation === choice.value}
            />
            {choice.label}
          </label>
        {/each}
      </fieldset>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="closeAfterDays">{m.discussionCloseAfter}</Label>
          <Input
            id="closeAfterDays"
            name="closeAfterDays"
            type="number"
            min={0}
            max={3650}
            value={settings.closeAfterDays}
          />
        </div>
        <div class="grid gap-2">
          <Label for="threadDepth">{m.discussionThreadDepth}</Label>
          <Input
            id="threadDepth"
            name="threadDepth"
            type="number"
            min={1}
            max={5}
            value={settings.threadDepth}
          />
        </div>
        <div class="grid gap-2">
          <Label for="pageSize">{m.discussionPageSize}</Label>
          <Input
            id="pageSize"
            name="pageSize"
            type="number"
            min={5}
            max={200}
            value={settings.pageSize}
          />
        </div>
        <div class="grid gap-2">
          <Label for="maxLinks">{m.discussionMaxLinks}</Label>
          <Input
            id="maxLinks"
            name="maxLinks"
            type="number"
            min={0}
            max={50}
            value={settings.maxLinks}
          />
        </div>
      </div>
      <div class="grid gap-2">
        <Label for="holdWords">{m.discussionHoldWords}</Label>
        <Textarea
          id="holdWords"
          name="holdWords"
          rows={4}
          value={settings.holdWords.join('\n')}
        />
      </div>
      <div class="grid gap-2">
        <Label for="blockWords">{m.discussionBlockWords}</Label>
        <Textarea
          id="blockWords"
          name="blockWords"
          rows={4}
          value={settings.blockWords.join('\n')}
        />
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="notifyModerators"
          checked={settings.notifyModerators}
        />
        {m.discussionNotifyModerators}
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="notifyAuthors"
          checked={settings.notifyAuthors}
        />
        {m.discussionNotifyAuthors}
      </label>
      <div><Button type="submit">{m.save}</Button></div>
    </form>
  </CardContent>
</Card>
