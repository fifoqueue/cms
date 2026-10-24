<script lang="ts">
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let pending = $state(false);

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.setupTitle}</title></svelte:head>

<AuthShell
  title={m.setupHeading}
  description={data.databaseConfigured ? m.setupStepSite : m.setupStepDatabase}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
>
  <form
    method="POST"
    action={data.databaseConfigured ? '?/complete' : '?/database'}
    use:enhance={() => {
      pending = true;
      return async ({ update }) => {
        try {
          await update();
        } finally {
          pending = false;
        }
      };
    }}
    class="space-y-4"
  >
    <FormMessage {form} />
    <fieldset disabled={pending} class="space-y-4">
      {#if !data.databaseConfigured || !data.hasKey}
        <div class="grid gap-2">
          <Label for="token">{m.setupKey}</Label>
          <Input
            id="token"
            name="token"
            type="password"
            autocomplete="off"
            required
          />
          <p class="text-xs text-muted-foreground">
            {m.setupKeyHelp}
          </p>
        </div>
      {:else}
        <details class="text-sm">
          <summary class="cursor-pointer">{m.setupKeyRestarted}</summary>
          <Input
            name="token"
            type="password"
            aria-label={m.setupNewKey}
            autocomplete="off"
            class="mt-2"
          />
        </details>
      {/if}
      {#if !data.databaseConfigured}
        <p class="text-sm text-muted-foreground">
          {m.setupDatabaseHelp}
        </p>
        <div class="grid grid-cols-[1fr_6rem] gap-3">
          <div class="grid gap-2">
            <Label for="host">{m.setupHost}</Label>
            <Input
              id="host"
              name="host"
              value={form?.databaseValues?.host ?? 'localhost'}
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="port">{m.emailPort}</Label>
            <Input
              id="port"
              name="port"
              type="number"
              min={1}
              max={65535}
              value={form?.databaseValues?.port ?? 3306}
              required
            />
          </div>
        </div>
        <div class="grid gap-2">
          <Label for="database">{m.setupDatabase}</Label>
          <Input
            id="database"
            name="database"
            value={form?.databaseValues?.database ?? ''}
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="username">{m.setupUsername}</Label>
          <Input
            id="username"
            name="username"
            autocomplete="off"
            value={form?.databaseValues?.username ?? ''}
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="password">{m.setupPassword}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autocomplete="off"
          />
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">
          {m.setupReady}
        </p>
        <div class="grid gap-2">
          <Label for="title">{m.setupSiteTitle}</Label>
          <Input
            id="title"
            name="title"
            maxlength={191}
            value={form?.siteValues?.title ?? ''}
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="description">{m.setupSiteDescription}</Label>
          <Input
            id="description"
            name="description"
            maxlength={500}
            value={form?.siteValues?.description ?? ''}
          />
        </div>
        <div class="grid gap-2">
          <Label for="locale">{m.setupSiteLanguage}</Label>
          <NativeSelect
            class="w-full"
            id="locale"
            name="locale"
            value={form?.siteValues?.locale ?? 'ko'}
          >
            <NativeSelectOption value="ko">한국어</NativeSelectOption>
            <NativeSelectOption value="en">English</NativeSelectOption>
            <NativeSelectOption value="ja">日本語</NativeSelectOption>
          </NativeSelect>
        </div>
        <div class="grid gap-2">
          <Label for="name">{m.setupAdminName}</Label>
          <Input
            id="name"
            name="name"
            autocomplete="name"
            value={form?.siteValues?.name ?? ''}
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="email">{m.setupAdminEmail}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autocomplete="username"
            value={form?.siteValues?.email ?? ''}
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="password">{m.setupAdminPassword}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autocomplete="new-password"
            minlength={8}
            maxlength={200}
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="confirmation">{m.setupConfirmPassword}</Label>
          <Input
            id="confirmation"
            name="confirmation"
            type="password"
            autocomplete="new-password"
            minlength={8}
            maxlength={200}
            required
          />
        </div>
      {/if}
      <Button type="submit" class="w-full">
        {pending
          ? m.setupApplying
          : data.databaseConfigured
            ? m.setupComplete
            : m.setupConnect}
      </Button>
    </fieldset>
    {#if pending}
      <p class="text-xs text-muted-foreground" role="status">
        {m.setupPending}
      </p>
    {/if}
  </form>
</AuthShell>
