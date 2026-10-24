<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import MaskedSecretField from '#lib/admin/settings/MaskedSecretField.svelte';
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
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const sso = $derived(data.sso);
  const subjects = $derived(
    Object.entries(sso.allowedSubjects)
      .map(([subject, email]) => `${subject} = ${email}`)
      .join('\n'),
  );
</script>

<svelte:head><title>{m.settingsSso}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.settingsSso}</CardTitle></CardHeader>
  <CardContent>
    {#if sso.managedByEnvironment}
      <p class="mb-4 text-sm text-muted-foreground">
        {m.ssoManagedByEnvironment}
      </p>
    {/if}
    <SettingsForm action="?/save" class="grid gap-4 sm:grid-cols-2">
      <label class="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="enabled" checked={sso.enabled} />
        {m.ssoEnabled}
      </label>
      <div class="grid gap-2 sm:col-span-2">
        <Label for="redirectUri">{m.ssoRedirectUri}</Label>
        {#if sso.redirectUri}
          <code id="redirectUri" class="rounded bg-muted p-2 text-sm break-all"
            >{sso.redirectUri}</code
          >
        {:else}
          <p id="redirectUri" class="text-sm text-destructive">
            {m.ssoRedirectMissing}
          </p>
        {/if}
      </div>
      <div class="grid gap-2">
        <Label for="issuer">{m.ssoIssuer}</Label>
        <Input
          id="issuer"
          name="issuer"
          type="url"
          maxlength={255}
          placeholder="https://id.example.com"
          value={sso.issuer}
        />
      </div>
      <div class="grid gap-2">
        <Label for="name">{m.ssoName}</Label>
        <Input id="name" name="name" maxlength={64} value={sso.name} />
      </div>
      <div class="grid gap-2">
        <Label for="clientId">{m.ssoClientId}</Label>
        <Input
          id="clientId"
          name="clientId"
          maxlength={255}
          autocomplete="off"
          value={sso.clientId}
        />
      </div>
      <MaskedSecretField
        name="clientSecret"
        label={m.ssoClientSecret}
        configured={sso.clientSecretConfigured}
        removeName="removeSecret"
        removeLabel={m.ssoRemoveSecret}
      />
      <div class="grid gap-2">
        <Label for="authMethod">{m.ssoAuthMethod}</Label>
        <NativeSelect
          class="w-full"
          id="authMethod"
          name="authMethod"
          value={sso.authMethod}
        >
          <NativeSelectOption value="client_secret_basic"
            >client_secret_basic</NativeSelectOption
          >
          <NativeSelectOption value="client_secret_post"
            >client_secret_post</NativeSelectOption
          >
          <NativeSelectOption value="none">{m.ssoAuthNone}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div class="grid gap-2">
        <Label for="scopes">{m.ssoScopes}</Label>
        <Input id="scopes" name="scopes" maxlength={500} value={sso.scopes} />
      </div>
      <div class="grid gap-2 sm:col-span-2">
        <Label for="allowedSubjects">{m.ssoAllowedSubjects}</Label>
        <Textarea
          id="allowedSubjects"
          name="allowedSubjects"
          rows={3}
          value={subjects}
        />
      </div>
      <div><Button type="submit">{m.save}</Button></div>
    </SettingsForm>
  </CardContent>
</Card>
