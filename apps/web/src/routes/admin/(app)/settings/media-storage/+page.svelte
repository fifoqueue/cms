<script lang="ts">
  import { resolve } from '$app/paths';
  import { can } from '@cms/sdk/capabilities';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { issueLines, issueText } from '#lib/admin/form-errors.js';
  import SecretField from '#lib/admin/settings/SecretField.svelte';
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import { pluginFieldName } from '#lib/admin/settings/mail-transports.js';
  import {
    CORE_STORAGE_DRIVERS,
    pluginDrivers,
    pluginIssuePath,
    splitStorageIssues,
    storageFailureTitle,
  } from '#lib/admin/settings/storage-drivers.js';
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
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  /** Saved settings, or what was submitted when the save or check was refused. */
  const values = $derived(form?.values ?? data.values);
  const saved = $derived(data.storage.s3);
  const coreNames = $derived({
    local: m.mediaStorageLocal,
    s3: m.mediaStorageS3,
  });
  /** Plugin drivers declared by the API; panels switch by position, never by plugin text. */
  const plugins = $derived(pluginDrivers(data.storage.availableDrivers));
  /**
   * Panels switch with CSS (`:has` on the checked radio), so the form works without JavaScript.
   * Hidden panels stay in the form; only the chosen driver's settings are sent.
   */
  const visibilityCss = $derived(
    `.storage-settings [data-driver-panel]{display:none}${[
      ...CORE_STORAGE_DRIVERS.map(
        (option) =>
          `.storage-settings:has(input[name="driver"][value="${option}"]:checked) [data-driver-panel="${option}"]`,
      ),
      ...plugins.map(
        (_, index) =>
          `.storage-settings:has(input[name="driver"][data-plugin="${index}"]:checked) [data-driver-panel="plugin-${index}"]`,
      ),
    ].join(',')}{display:grid}`,
  );
  /** A saved plugin driver whose plugin is gone: uploads fail until another is chosen. */
  const missingPlugin = $derived(
    !(CORE_STORAGE_DRIVERS as readonly string[]).includes(
      data.storage.driver,
    ) && !plugins.some(({ id }) => id === data.storage.driver),
  );
  /** Values to show in a plugin driver's fields: only that driver's own. */
  const pluginValues = (id: string) =>
    values.plugin?.id === id ? values.plugin.values : {};
  const secretConfigured = (id: string, key: string) =>
    data.storage.driver === id &&
    (data.storage.pluginSecretsConfigured ?? []).includes(key);

  // svelte-ignore state_referenced_locally
  let endpoint = $state(values.s3.endpoint);
  // svelte-ignore state_referenced_locally
  let accessKeyId = $state(values.s3.accessKeyId);
  /** The API asks for the secret again once the endpoint or account changes. */
  const secretStale = $derived(
    !!saved?.secretAccessKeyConfigured &&
      (endpoint.trim() !== saved.endpoint ||
        accessKeyId.trim() !== saved.accessKeyId),
  );

  /** Issues of S3 and plugin fields show under their inputs; the rest with the refusal. */
  const split = $derived(
    splitStorageIssues(
      form?.issues ?? [],
      values.driver,
      data.storage.availableDrivers,
    ),
  );
  const issues = $derived(
    Object.fromEntries(
      Object.entries(split.fields).map(([path, message]) => [
        path,
        issueText(m, i18n.language, message ?? ''),
      ]),
    ) as Partial<Record<string, string>>,
  );
  /** A plugin field's issue, only on the driver that was submitted. */
  const pluginIssue = (id: string, key: string) =>
    values.driver === id ? issues[pluginIssuePath(key)] : undefined;
  /** A refusal next to the buttons: the probe's error, or what it says about other fields. */
  const failure = $derived.by(() => {
    if (!form?.message) return null;
    return {
      title: storageFailureTitle(m, i18n.language, form),
      lines: issueLines(m, i18n.language, split.rest),
      // An outbound access rule (service `media-storage`) must allow a private endpoint.
      egress: form.code === 'destination_blocked',
    };
  });
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
  <title>{m.settingsMediaStorage}</title>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- built from the fixed driver ids and panel positions -->
  {@html `<style>${visibilityCss}</style>`}
</svelte:head>

{#snippet problem(path: string)}
  {#if issues[path]}
    <p id="{path}-error" class="text-xs text-destructive">{issues[path]}</p>
  {/if}
{/snippet}

<FormMessage form={form?.notice ? { notice: form.notice } : null} />

<Card>
  <CardHeader><CardTitle>{m.mediaStorageTitle}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm
      action="?/save"
      novalidate
      class="storage-settings grid gap-6"
    >
      <Alert>
        <AlertDescription>{m.mediaStorageSwitchNote}</AlertDescription>
      </Alert>

      <fieldset class="grid gap-4">
        <legend class="mb-3 text-sm font-semibold">
          {m.mediaStorageDriver}
        </legend>
        <div
          class="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted p-1"
        >
          {#each CORE_STORAGE_DRIVERS as option (option)}
            <label
              class="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                class="sr-only"
                type="radio"
                name="driver"
                value={option}
                checked={values.driver === option}
              />
              {coreNames[option]}
            </label>
          {/each}
          {#each plugins as plugin, index (plugin.id)}
            <label
              class="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                class="sr-only"
                type="radio"
                name="driver"
                value={plugin.id}
                data-plugin={index}
                checked={values.driver === plugin.id}
              />
              {plugin.label}
            </label>
          {/each}
        </div>
        {#if missingPlugin}
          <Alert variant="destructive">
            <AlertDescription>{m.mediaStoragePluginMissing}</AlertDescription>
          </Alert>
        {/if}

        <div class="rounded-lg border p-4" data-driver-panel="local">
          <p class="text-sm text-muted-foreground">
            {m.mediaStorageLocalHelp}
          </p>
        </div>

        <div
          class="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          data-driver-panel="s3"
        >
          <p class="text-sm text-muted-foreground sm:col-span-2">
            {m.mediaStorageS3Help}
            {#if saved}{m.mediaStorageLocationFixed}{/if}
          </p>
          <div class="grid content-start gap-2 sm:col-span-2">
            <Label for="s3.endpoint">{m.mediaStorageEndpoint}</Label>
            <Input
              id="s3.endpoint"
              name="s3.endpoint"
              type="url"
              autocomplete="off"
              maxlength={2048}
              placeholder="https://s3.ap-northeast-2.amazonaws.com"
              readonly={!!saved}
              bind:value={endpoint}
              {...described('s3.endpoint', 's3.endpoint-help')}
            />
            {@render problem('s3.endpoint')}
            <p
              id="s3.endpoint-help"
              class="text-xs break-all text-muted-foreground"
            >
              {m.mediaStorageEndpointHelp}
            </p>
          </div>
          <div class="grid content-start gap-2">
            <Label for="s3.region">{m.mediaStorageRegion}</Label>
            <Input
              id="s3.region"
              name="s3.region"
              autocomplete="off"
              maxlength={100}
              placeholder="auto"
              value={values.s3.region}
              {...described('s3.region', 's3.region-help')}
            />
            {@render problem('s3.region')}
            <p id="s3.region-help" class="text-xs text-muted-foreground">
              {m.mediaStorageRegionHelp}
            </p>
          </div>
          <div class="grid content-start gap-2">
            <Label for="s3.bucket">{m.mediaStorageBucket}</Label>
            <Input
              id="s3.bucket"
              name="s3.bucket"
              autocomplete="off"
              maxlength={255}
              readonly={!!saved}
              value={values.s3.bucket}
              {...described('s3.bucket')}
            />
            {@render problem('s3.bucket')}
          </div>
          <div class="grid content-start gap-2">
            <Label for="s3.accessKeyId">{m.mediaStorageAccessKeyId}</Label>
            <Input
              id="s3.accessKeyId"
              name="s3.accessKeyId"
              autocomplete="off"
              maxlength={255}
              bind:value={accessKeyId}
              {...described('s3.accessKeyId')}
            />
            {@render problem('s3.accessKeyId')}
          </div>
          <SecretField
            name="s3.secretAccessKey"
            label={m.mediaStorageSecretAccessKey}
            configured={!!saved?.secretAccessKeyConfigured && !secretStale}
            helpId="s3.secretAccessKey-help"
            maxlength={4096}
            error={issues['s3.secretAccessKey']}
            help={secretStale ? m.mediaStorageSecretReenter : undefined}
          />
          <div class="grid content-start gap-2 sm:col-span-2">
            <Label for="s3.publicBaseUrl">{m.mediaStoragePublicBaseUrl}</Label>
            <Input
              id="s3.publicBaseUrl"
              name="s3.publicBaseUrl"
              type="url"
              autocomplete="off"
              maxlength={2048}
              placeholder="https://cdn.example.com"
              value={values.s3.publicBaseUrl}
              {...described('s3.publicBaseUrl', 's3.publicBaseUrl-help')}
            />
            {@render problem('s3.publicBaseUrl')}
            <p id="s3.publicBaseUrl-help" class="text-xs text-muted-foreground">
              {m.mediaStoragePublicBaseUrlHelp}
            </p>
          </div>
          <div class="grid content-start gap-2">
            <Label for="s3.prefix">{m.mediaStoragePrefix}</Label>
            <Input
              id="s3.prefix"
              name="s3.prefix"
              autocomplete="off"
              maxlength={200}
              placeholder="media/"
              readonly={!!saved}
              value={values.s3.prefix}
              {...described('s3.prefix', 's3.prefix-help')}
            />
            {@render problem('s3.prefix')}
            <p id="s3.prefix-help" class="text-xs text-muted-foreground">
              {m.mediaStoragePrefixHelp}
            </p>
          </div>
          <div class="grid content-start gap-2">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="s3.forcePathStyle"
                checked={values.s3.forcePathStyle}
                aria-describedby="s3.forcePathStyle-help"
              />
              {m.mediaStorageForcePathStyle}
            </label>
            <p
              id="s3.forcePathStyle-help"
              class="text-xs text-muted-foreground"
            >
              {m.mediaStorageForcePathStyleHelp}
            </p>
          </div>
        </div>

        {#each plugins as plugin, index (plugin.id)}
          {@const current = pluginValues(plugin.id)}
          <div
            class="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
            data-driver-panel="plugin-{index}"
          >
            <p class="text-sm text-muted-foreground sm:col-span-2">
              {m.mediaStoragePluginHelp(plugin.label)}
            </p>
            {#each plugin.fields as field (field.key)}
              {@const name = pluginFieldName(plugin.id, field.key)}
              {@const issue = pluginIssue(plugin.id, field.key)}
              {#if field.type === 'secret'}
                <SecretField
                  {name}
                  label={field.required
                    ? m.emailFieldRequired(field.label)
                    : field.label}
                  configured={secretConfigured(plugin.id, field.key)}
                  removeName={field.required ? undefined : `${name}.remove`}
                  helpId="{name}-help"
                  maxlength={10000}
                  error={issue}
                />
              {:else if field.type === 'boolean'}
                <div class="grid gap-1 sm:col-span-2">
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      {name}
                      checked={current[field.key] === true}
                      aria-invalid={issue ? true : undefined}
                      aria-describedby={issue ? `${name}-error` : undefined}
                    />
                    {field.label}
                  </label>
                  {#if issue}
                    <p id="{name}-error" class="text-xs text-destructive">
                      {issue}
                    </p>
                  {/if}
                </div>
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
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={issue ? `${name}-error` : undefined}
                  />
                  {#if issue}
                    <p id="{name}-error" class="text-xs text-destructive">
                      {issue}
                    </p>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </fieldset>

      {#if failure}
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>
            <p class="font-medium">{failure.title}</p>
            {#if failure.lines.length}
              <ul class="list-disc pl-4">
                {#each failure.lines as line, index (index)}
                  <li>{line}</li>
                {/each}
              </ul>
            {/if}
            {#if failure.egress}
              <p>
                {m.mediaStorageEgressHint}
                {#if can(data.user, 'egress.manage')}
                  <a
                    href={resolve('/admin/(app)/settings/egress')}
                    class="underline">{m.settingsEgress}</a
                  >
                {/if}
              </p>
            {/if}
          </AlertDescription>
        </Alert>
      {/if}

      <div class="grid gap-2">
        <div class="flex flex-wrap gap-2">
          <Button type="submit">{m.save}</Button>
          <Button type="submit" variant="outline" formaction="?/test"
            >{m.mediaStorageTest}</Button
          >
        </div>
        <p class="text-xs text-muted-foreground">{m.mediaStorageSaveHelp}</p>
      </div>
    </SettingsForm>
  </CardContent>
</Card>
