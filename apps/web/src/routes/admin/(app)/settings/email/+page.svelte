<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import {
    EMAIL_PROVIDER_FIELDS,
    EMAIL_PROVIDERS,
    EMAIL_TEMPLATE_PLACEHOLDERS,
    EMAIL_TRANSPORTS,
    SMTP_SECURITY,
  } from '@cms/sdk';
  import type { EmailProvider, EmailProviderField } from '@cms/sdk';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import SecretField from '#lib/admin/settings/SecretField.svelte';
  import { emailIssueText } from '#lib/admin/settings/email-issues.js';
  import { pluginFieldName } from '#lib/admin/settings/mail-transports.js';
  import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
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
  /** Saved settings, or what was submitted when the save was refused. */
  const values = $derived(form?.values ?? data.email);
  const securityNames = $derived({
    tls: 'TLS',
    starttls: 'STARTTLS',
    none: m.none,
  });
  const transportNames = $derived({
    smtp: m.emailTransportSmtp,
    http: m.emailTransportHttp,
  });
  const providerNames = $derived<Record<EmailProvider, string>>({
    sendgrid: 'SendGrid',
    mailgun: 'Mailgun',
    ses: 'Amazon SES',
    postmark: 'Postmark',
    resend: 'Resend',
    brevo: 'Brevo',
    sparkpost: 'SparkPost',
    mailjet: 'Mailjet',
    mailersend: 'MailerSend',
    custom: m.emailProviderCustom,
  });
  const regionNames = $derived<Record<string, string>>({
    us: m.emailRegionUs,
    eu: m.emailRegionEu,
  });

  const usedBy = (target: EmailProvider, field: EmailProviderField) =>
    EMAIL_PROVIDER_FIELDS[target].required.includes(field) ||
    EMAIL_PROVIDER_FIELDS[target].optional.includes(field);
  /** Providers showing a field, for the `data-providers` visibility rules. */
  const showing = (field: EmailProviderField) =>
    EMAIL_PROVIDERS.filter((target) => usedBy(target, field)).join(' ');
  const fixedRegions = EMAIL_PROVIDERS.filter(
    (target) => EMAIL_PROVIDER_FIELDS[target].regions,
  ).join(' ');
  const regionOptions = [
    ...new Set(
      EMAIL_PROVIDERS.flatMap(
        (target) => EMAIL_PROVIDER_FIELDS[target].regions ?? [],
      ),
    ),
  ];
  const freeRegions = EMAIL_PROVIDERS.filter(
    (target) => EMAIL_PROVIDER_FIELDS[target].regionPattern,
  ).join(' ');
  /**
   * Panels and fields switch with CSS (`:has` on the checked radio or option), so the form
   * works without JavaScript; the state below follows the same controls for labels and issues.
   * Hidden fields stay in the form, so switching never drops the other's values.
   */
  const visibility = [
    '.email-settings [data-transport],.email-settings [data-providers],.email-settings [data-plugin-panel]{display:none}',
    ...EMAIL_TRANSPORTS.map(
      (option) =>
        `.email-settings:has(input[name="transport"][value="${option}"]:checked) [data-transport="${option}"]`,
    ),
    ...EMAIL_PROVIDERS.map(
      (option) =>
        `.email-settings:has(select[name="http.provider"] option[value="${option}"]:checked) [data-providers~="${option}"]`,
    ),
  ];
  /** Plugin transports declared by the API; panels switch by position, never by plugin text. */
  const plugins = $derived(data.email.availableTransports ?? []);
  const visibilityCss = $derived(
    `${visibility[0]}${[
      ...visibility.slice(1),
      ...plugins.map(
        (_, index) =>
          `.email-settings:has(input[name="transport"][data-plugin="${index}"]:checked) [data-plugin-panel="${index}"]`,
      ),
    ].join(',')}{display:grid}`,
  );
  /** A saved plugin transport whose plugin is gone: sending fails until another is chosen. */
  const missingPlugin = $derived(
    !!data.email.pluginTransport &&
      !plugins.some(({ id }) => id === data.email.pluginTransport?.id),
  );
  /** Values to show in a plugin transport's fields: only that transport's own. */
  const pluginValues = (id: string) =>
    values.pluginTransport?.id === id ? values.pluginTransport.values : {};
  const secretConfigured = (id: string, key: string) =>
    data.email.pluginTransport?.id === id &&
    data.email.pluginTransport.secretsConfigured.includes(key);

  // svelte-ignore state_referenced_locally
  let transport = $state<string>(
    values.pluginTransport &&
      plugins.some(({ id }) => id === values.pluginTransport?.id)
      ? values.pluginTransport.id
      : values.transport,
  );
  // svelte-ignore state_referenced_locally
  let provider = $state(values.http.provider);
  const spec = $derived(EMAIL_PROVIDER_FIELDS[provider]);
  const uses = (field: EmailProviderField) => usedBy(provider, field);

  /** A region starts empty when it does not fit the provider it is shown for. */
  const fitting = (target: EmailProvider, region: string) => {
    const fields = EMAIL_PROVIDER_FIELDS[target];
    return fields.regions
      ? fields.regions.includes(region)
      : (fields.regionPattern?.test(region) ?? true);
  };
  const saved = $derived(data.email.http);
  // svelte-ignore state_referenced_locally
  let regionChoice = $state(
    EMAIL_PROVIDER_FIELDS[provider].regions &&
      fitting(provider, values.http.region)
      ? values.http.region
      : '',
  );
  // svelte-ignore state_referenced_locally
  let regionText = $state(
    !EMAIL_PROVIDER_FIELDS[provider].regions &&
      fitting(provider, values.http.region)
      ? values.http.region
      : '',
  );
  // svelte-ignore state_referenced_locally
  let keyId = $state(values.http.keyId);
  // svelte-ignore state_referenced_locally
  let url = $state(values.http.url);
  // svelte-ignore state_referenced_locally
  let authHeader = $state(values.http.authHeader);
  /** The provider the key ID was typed for: SES access key IDs and Mailjet API keys differ. */
  // svelte-ignore state_referenced_locally
  let keyIdOwner = $state(values.http.provider);

  const switchProvider = (next: EmailProvider) => {
    provider = next;
    if (EMAIL_PROVIDER_FIELDS[next].regions && !fitting(next, regionChoice))
      regionChoice = '';
    if (!EMAIL_PROVIDER_FIELDS[next].regions && !fitting(next, regionText))
      regionText = '';
    if (usedBy(next, 'keyId') && keyIdOwner !== next) {
      keyId = next === saved.provider ? saved.keyId : '';
      keyIdOwner = next;
    }
  };

  /** The API asks for the secret again once what it authenticates changes. */
  const secretStale = $derived(
    saved.secretConfigured &&
      (provider !== saved.provider ||
        keyId.trim() !== saved.keyId ||
        url.trim() !== saved.url ||
        authHeader.trim() !== saved.authHeader),
  );
  const keyIdLabel = $derived(
    provider === 'ses' ? m.emailAccessKeyId : m.emailApiKey,
  );
  const secretLabel = $derived(
    (
      {
        ses: m.emailSecretAccessKey,
        mailjet: m.emailSecretKey,
        postmark: m.emailServerToken,
        custom: m.emailSecretValue,
      } as Partial<Record<EmailProvider, string>>
    )[provider] ?? m.emailApiKey,
  );
  const templateSample = `{
  "from": { "email": {{fromEmail}}, "name": {{fromName}} },
  "to": [{{to}}],
  "subject": {{subject}},
  "text": {{text}}
}`;
  const placeholders = EMAIL_TEMPLATE_PLACEHOLDERS.map(
    (name) => `{{${name}}}`,
  ).join(', ');

  /** Form fields by issue path, with the panel they sit in for issues listed apart. */
  const fields = $derived<Record<string, string>>({
    fromName: m.emailFromName,
    fromEmail: m.emailFromEmail,
    'smtp.host': `${m.emailTransportSmtp} › ${m.emailHost}`,
    'smtp.port': `${m.emailTransportSmtp} › ${m.emailPort}`,
    'smtp.security': `${m.emailTransportSmtp} › ${m.emailSecurity}`,
    'smtp.username': `${m.emailTransportSmtp} › ${m.emailUsername}`,
    'smtp.password': `${m.emailTransportSmtp} › ${m.emailPassword}`,
    'http.region': `${m.emailTransportHttp} › ${m.emailRegion}`,
    'http.domain': `${m.emailTransportHttp} › ${m.emailDomain}`,
    'http.keyId': `${m.emailTransportHttp} › ${m.emailApiKey}`,
    'http.secret': `${m.emailTransportHttp} › ${m.emailSecretValue}`,
    'http.url': `${providerNames.custom} › ${m.emailEndpoint}`,
    'http.authHeader': `${providerNames.custom} › ${m.emailAuthHeader}`,
    'http.bodyTemplate': `${providerNames.custom} › ${m.emailBodyTemplate}`,
  });
  /** Whether a field is on screen for the chosen transport and provider. */
  const shown = (path: string) => {
    const [panel, field] = path.split('.');
    if (!field) return true;
    if (panel !== transport) return false;
    return (
      panel === 'smtp' ||
      field === 'secret' ||
      uses(field as EmailProviderField)
    );
  };
  const fieldIssues = $derived(
    (form?.issues ?? [])
      .filter((issue) => issue.path in fields)
      .map((issue) => ({
        path: issue.path,
        text: emailIssueText(m, i18n.language, issue),
      })),
  );
  /** Issues next to their inputs; the first per field. */
  const issues = $derived.by(() => {
    const found: Partial<Record<string, string>> = {};
    for (const issue of fieldIssues)
      if (shown(issue.path)) found[issue.path] ??= issue.text;
    return found;
  });
  /** Issues of fields the current choice hides, listed with their labels. */
  const hiddenIssues = $derived(
    fieldIssues.filter((issue) => !shown(issue.path)),
  );
  const summary = $derived(
    form?.issues
      ? {
          ...form,
          issues: form.issues.filter((issue) => !(issue.path in fields)),
        }
      : form,
  );
  /** Invalid state and descriptions (help text first, then the issue). */
  const described = (path: string, help?: string) => {
    const ids = [help, issues[path] && `${path}-error`].filter(Boolean);
    return {
      'aria-invalid': issues[path] ? true : undefined,
      'aria-describedby': ids.length ? ids.join(' ') : undefined,
    };
  };
</script>

<svelte:head>
  <title>{m.settingsEmail}</title>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- built from the SDK's fixed transport and provider names -->
  {@html `<style>${visibilityCss}</style>`}
</svelte:head>

{#snippet problem(path: string)}
  {#if issues[path]}
    <p id="{path}-error" class="text-xs text-destructive">{issues[path]}</p>
  {/if}
{/snippet}

<FormMessage form={summary} />

<Card>
  <CardHeader><CardTitle>{m.emailTitle}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm action="?/save" novalidate class="email-settings grid gap-6">
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" checked={values.enabled} />
        {m.emailEnabled}
      </label>

      <fieldset class="grid gap-4 sm:grid-cols-2">
        <legend class="mb-3 text-sm font-semibold">{m.emailSender}</legend>
        <div class="grid content-start gap-2">
          <Label for="fromName">{m.emailFromName}</Label>
          <Input
            id="fromName"
            name="fromName"
            maxlength={191}
            value={values.fromName}
            {...described('fromName')}
          />
          {@render problem('fromName')}
        </div>
        <div class="grid content-start gap-2">
          <Label for="fromEmail">{m.emailFromEmail}</Label>
          <Input
            id="fromEmail"
            name="fromEmail"
            type="email"
            maxlength={191}
            placeholder="no-reply@example.com"
            value={values.fromEmail}
            {...described('fromEmail')}
          />
          {@render problem('fromEmail')}
        </div>
      </fieldset>

      <fieldset class="grid gap-4">
        <legend class="mb-3 text-sm font-semibold">{m.emailTransport}</legend>
        <div
          class="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted p-1"
        >
          {#each EMAIL_TRANSPORTS as option (option)}
            <label
              class="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                class="sr-only"
                type="radio"
                name="transport"
                value={option}
                bind:group={transport}
              />
              {transportNames[option]}
            </label>
          {/each}
          {#each plugins as plugin, index (plugin.id)}
            <label
              class="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                class="sr-only"
                type="radio"
                name="transport"
                value={plugin.id}
                data-plugin={index}
                bind:group={transport}
              />
              {plugin.label}
            </label>
          {/each}
        </div>
        <input
          type="hidden"
          name="legacyTransport"
          value={data.email.transport}
        />
        {#if missingPlugin}
          <Alert variant="destructive">
            <AlertDescription>{m.emailPluginTransportMissing}</AlertDescription>
          </Alert>
        {/if}

        <div
          class="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          data-transport="smtp"
        >
          <div class="grid content-start gap-2">
            <Label for="smtp.host">{m.emailHost}</Label>
            <Input
              id="smtp.host"
              name="smtp.host"
              maxlength={255}
              placeholder="smtp.example.com"
              value={values.smtp.host}
              {...described('smtp.host')}
            />
            {@render problem('smtp.host')}
          </div>
          <div class="grid content-start gap-2">
            <Label for="smtp.port">{m.emailPort}</Label>
            <Input
              id="smtp.port"
              name="smtp.port"
              type="number"
              min={1}
              max={65535}
              value={values.smtp.port}
              {...described('smtp.port')}
            />
            {@render problem('smtp.port')}
          </div>
          <div class="grid content-start gap-2">
            <Label for="smtp.security">{m.emailSecurity}</Label>
            <NativeSelect
              class="w-full"
              id="smtp.security"
              name="smtp.security"
              value={values.smtp.security}
              {...described('smtp.security')}
            >
              {#each SMTP_SECURITY as option (option)}
                <NativeSelectOption value={option}
                  >{securityNames[option]}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
            {@render problem('smtp.security')}
          </div>
          <div class="grid content-start gap-2">
            <Label for="smtp.username">{m.emailUsername}</Label>
            <Input
              id="smtp.username"
              name="smtp.username"
              autocomplete="off"
              maxlength={255}
              value={values.smtp.username}
              {...described('smtp.username')}
            />
            {@render problem('smtp.username')}
          </div>
          <SecretField
            name="smtp.password"
            label={m.emailPassword}
            configured={data.email.smtp.passwordConfigured}
            removeName="smtp.passwordRemove"
            helpId="smtp.password-help"
            error={issues['smtp.password']}
          />
        </div>

        <div
          class="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          data-transport="http"
        >
          <div class="grid content-start gap-2 sm:col-span-2">
            <Label for="http.provider">{m.emailProvider}</Label>
            <NativeSelect
              class="w-full sm:w-1/2"
              id="http.provider"
              name="http.provider"
              value={provider}
              onchange={(event) =>
                switchProvider(event.currentTarget.value as EmailProvider)}
            >
              {#each EMAIL_PROVIDERS as option (option)}
                <NativeSelectOption value={option}
                  >{providerNames[option]}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
          </div>
          <div
            class="grid content-start gap-2"
            data-providers={showing('domain')}
          >
            <Label for="http.domain">{m.emailDomain}</Label>
            <Input
              id="http.domain"
              name="http.domain"
              maxlength={253}
              placeholder="mg.example.com"
              value={values.http.domain}
              {...described('http.domain')}
            />
            {@render problem('http.domain')}
          </div>
          <div class="grid content-start gap-2" data-providers={fixedRegions}>
            <Label for="http.regionChoice">{m.emailRegion}</Label>
            <NativeSelect
              class="w-full"
              id="http.regionChoice"
              name="http.regionChoice"
              bind:value={regionChoice}
              {...described('http.region')}
            >
              <NativeSelectOption value=""
                >{m.emailRegionDefault}</NativeSelectOption
              >
              {#each regionOptions as option (option)}
                <NativeSelectOption value={option}
                  >{regionNames[option] ?? option}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
            {#if spec.regions}{@render problem('http.region')}{/if}
          </div>
          <div class="grid content-start gap-2" data-providers={freeRegions}>
            <Label for="http.region">{m.emailAwsRegion}</Label>
            <Input
              id="http.region"
              name="http.region"
              maxlength={40}
              placeholder="ap-northeast-2"
              bind:value={regionText}
              {...described('http.region')}
            />
            {#if !spec.regions}{@render problem('http.region')}{/if}
          </div>
          <div
            class="grid content-start gap-2"
            data-providers={showing('keyId')}
          >
            <Label for="http.keyId">{keyIdLabel}</Label>
            <Input
              id="http.keyId"
              name="http.keyId"
              autocomplete="off"
              maxlength={255}
              bind:value={keyId}
              {...described('http.keyId')}
            />
            {@render problem('http.keyId')}
          </div>
          <div
            class="grid content-start gap-2 sm:col-span-2"
            data-providers={showing('url')}
          >
            <Label for="http.url">{m.emailEndpoint}</Label>
            <Input
              id="http.url"
              name="http.url"
              type="url"
              maxlength={2048}
              placeholder="https://mail.example.com/send"
              bind:value={url}
              {...described('http.url')}
            />
            {@render problem('http.url')}
          </div>
          <div
            class="grid content-start gap-2"
            data-providers={showing('authHeader')}
          >
            <Label for="http.authHeader">{m.emailAuthHeader}</Label>
            <Input
              id="http.authHeader"
              name="http.authHeader"
              autocomplete="off"
              maxlength={100}
              placeholder="Authorization"
              bind:value={authHeader}
              {...described('http.authHeader', 'http.authHeader-help')}
            />
            {@render problem('http.authHeader')}
            <p id="http.authHeader-help" class="text-xs text-muted-foreground">
              {m.emailAuthHeaderHelp}
            </p>
          </div>
          <SecretField
            name="http.secret"
            label={secretLabel}
            configured={saved.secretConfigured && !secretStale}
            removeName="http.secretRemove"
            helpId="http.secret-help"
            maxlength={2000}
            error={issues['http.secret']}
            help={secretStale ? m.emailSecretReenter : undefined}
          />
          <div
            class="grid content-start gap-2 sm:col-span-2"
            data-providers={showing('bodyTemplate')}
          >
            <Label for="http.bodyTemplate">{m.emailBodyTemplate}</Label>
            <Textarea
              id="http.bodyTemplate"
              name="http.bodyTemplate"
              class="font-mono"
              rows={8}
              maxlength={10000}
              spellcheck={false}
              placeholder={templateSample}
              value={values.http.bodyTemplate}
              {...described('http.bodyTemplate', 'http.bodyTemplate-help')}
            />
            {@render problem('http.bodyTemplate')}
            <p
              id="http.bodyTemplate-help"
              class="text-xs text-muted-foreground"
            >
              {m.emailBodyTemplateHelp(placeholders)}
            </p>
          </div>
        </div>

        {#each plugins as plugin, index (plugin.id)}
          {@const current = pluginValues(plugin.id)}
          <div
            class="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
            data-plugin-panel={index}
          >
            <p class="text-sm text-muted-foreground sm:col-span-2">
              {m.emailPluginTransportHelp(plugin.label)}
            </p>
            {#each plugin.fields as field (field.key)}
              {@const name = pluginFieldName(plugin.id, field.key)}
              {#if field.type === 'secret'}
                <SecretField
                  {name}
                  label={field.label}
                  configured={secretConfigured(plugin.id, field.key)}
                  removeName="{name}.remove"
                  helpId="{name}-help"
                  maxlength={10000}
                />
              {:else if field.type === 'boolean'}
                <label class="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    {name}
                    checked={current[field.key] === true}
                  />
                  {field.label}
                </label>
              {:else}
                <div class="grid content-start gap-2">
                  <Label for={name}
                    >{field.required
                      ? m.emailFieldRequired(field.label)
                      : field.label}</Label
                  >
                  <Input
                    id={name}
                    {name}
                    type={field.type === 'number' ? 'number' : 'text'}
                    autocomplete="off"
                    maxlength={field.type === 'text' ? 10000 : undefined}
                    required={field.required}
                    value={current[field.key] === undefined
                      ? ''
                      : String(current[field.key])}
                  />
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </fieldset>

      {#if hiddenIssues.length}
        <Alert variant="destructive">
          <AlertDescription>
            <ul class="list-disc pl-4">
              {#each hiddenIssues as issue, index (index)}
                <li>{fields[issue.path]}: {issue.text}</li>
              {/each}
            </ul>
          </AlertDescription>
        </Alert>
      {/if}

      <div>
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
