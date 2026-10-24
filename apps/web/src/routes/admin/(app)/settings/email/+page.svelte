<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import { SMTP_SECURITY } from '@cms/sdk';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import SecretField from '#lib/admin/settings/SecretField.svelte';
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
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const email = $derived(data.email);
  const securityNames = $derived({
    tls: 'TLS',
    starttls: 'STARTTLS',
    none: m.none,
  });
</script>

<svelte:head><title>{m.settingsEmail}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.emailTitle}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm action="?/save" class="grid gap-4 sm:grid-cols-2">
      <label class="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="enabled" checked={email.enabled} />
        {m.emailEnabled}
      </label>
      <div class="grid gap-2">
        <Label for="host">{m.emailHost}</Label>
        <Input
          id="host"
          name="host"
          maxlength={255}
          placeholder="smtp.example.com"
          value={email.host}
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
          value={email.port}
        />
      </div>
      <div class="grid gap-2">
        <Label for="security">{m.emailSecurity}</Label>
        <NativeSelect
          class="w-full"
          id="security"
          name="security"
          value={email.security}
        >
          {#each SMTP_SECURITY as option (option)}
            <NativeSelectOption value={option}
              >{securityNames[option]}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <div class="grid gap-2">
        <Label for="username">{m.emailUsername}</Label>
        <Input
          id="username"
          name="username"
          autocomplete="off"
          maxlength={255}
          value={email.username}
        />
      </div>
      <SecretField
        name="password"
        label={m.emailPassword}
        configured={email.passwordConfigured}
        removeName="removePassword"
        helpId="password-help"
      />
      <div class="grid gap-2">
        <Label for="fromName">{m.emailFromName}</Label>
        <Input
          id="fromName"
          name="fromName"
          maxlength={191}
          value={email.fromName}
        />
      </div>
      <div class="grid gap-2">
        <Label for="fromEmail">{m.emailFromEmail}</Label>
        <Input
          id="fromEmail"
          name="fromEmail"
          type="email"
          maxlength={191}
          value={email.fromEmail}
        />
      </div>
      <div class="sm:col-span-2">
        <Button type="submit">{m.save}</Button>
      </div>
    </SettingsForm>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.emailTest}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm action="?/test" reset class="flex flex-wrap items-end gap-4">
      <div class="grid gap-2">
        <Label for="to">{m.emailTestTo}</Label>
        <Input
          id="to"
          name="to"
          type="email"
          required
          value={data.user.email}
        />
      </div>
      <Button type="submit" variant="outline">{m.emailTest}</Button>
    </SettingsForm>
  </CardContent>
</Card>
