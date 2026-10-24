<script lang="ts">
  import { AVATAR_DEFAULTS } from '@cms/sdk';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
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
  // svelte-ignore state_referenced_locally
  let showName = $state(data.discussion.showName);
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
    <SettingsForm action="?/save" class="grid gap-6">
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" checked={settings.enabled} />
        {m.discussionEnabled}
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requireLogin"
          checked={settings.requireLogin}
        />
        {m.discussionRequireLogin}
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="showAvatars"
          checked={settings.showAvatars}
        />
        {m.discussionAvatars}
      </label>
      <fieldset class="grid gap-3">
        <legend class="mb-2 text-sm font-medium">{m.discussionFields}</legend>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showName" bind:checked={showName} />
          {m.discussionShowName}
        </label>
        <div class="grid gap-2">
          <Label for="defaultName">{m.discussionDefaultName}</Label>
          <Input
            id="defaultName"
            name="defaultName"
            required={!showName}
            maxlength={100}
            value={settings.defaultName}
          />
          <p class="text-xs text-muted-foreground">
            {m.discussionDefaultNameHelp}
          </p>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showEmail"
            checked={settings.showEmail}
          />
          {m.discussionShowEmail}
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showWebsite"
            checked={settings.showWebsite}
          />
          {m.discussionShowWebsite}
        </label>
      </fieldset>
      <div class="grid gap-2">
        <Label for="avatarDefault">{m.discussionAvatarDefault}</Label>
        <NativeSelect
          id="avatarDefault"
          name="avatarDefault"
          value={settings.avatarDefault}
        >
          {#each AVATAR_DEFAULTS as style (style)}<NativeSelectOption
              value={style}>{m.avatarStyle(style)}</NativeSelectOption
            >{/each}
        </NativeSelect>
      </div>
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
    </SettingsForm>
  </CardContent>
</Card>
