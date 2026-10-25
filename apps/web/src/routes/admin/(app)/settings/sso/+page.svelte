<script lang="ts">
  import { OIDC_AUTH_METHODS, SSO_PROVIDERS_MAX } from '@cms/sdk';
  import { default as Plus } from '@lucide/svelte/icons/plus';
  import { default as Trash2 } from '@lucide/svelte/icons/trash-2';
  import CopyButton from '#lib/admin/CopyButton.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { issueText } from '#lib/admin/form-errors.js';
  import SecretField from '#lib/admin/settings/SecretField.svelte';
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import {
    blankProvider,
    ssoIssueField,
  } from '#lib/admin/settings/sso-form.js';
  import type {
    SsoProviderField,
    SsoProviderValues,
  } from '#lib/admin/settings/sso-form.js';
  import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
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

  /** Saved providers, or what was posted when a save was refused (or edited without scripts). */
  const values = $derived(
    (form && 'values' in form ? form.values : undefined) ?? data.providers,
  );
  const posted = $derived(
    form && 'issues' in form && Array.isArray(form.issues) ? form.issues : [],
  );
  /** Issue texts by `<index>.<field>`, the first per field; the rest is listed apart. */
  const placement = $derived.by(() => {
    const placed: Partial<Record<string, string>> = {};
    const apart: typeof posted = [];
    for (const issue of posted) {
      const target = ssoIssueField(issue.path);
      if (target && target.index < values.length)
        placed[`${target.index}.${target.field}`] ??= issueText(
          m,
          i18n.language,
          issue.message,
        );
      else apart.push(issue);
    }
    return { placed, apart };
  });
  const summary = $derived(
    form && 'message' in form ? { ...form, issues: placement.apart } : form,
  );

  interface Item extends SsoProviderValues {
    /** Keeps each provider's inputs (and a typed secret) across additions and removals. */
    key: string;
    issues: Partial<Record<SsoProviderField, string>>;
  }

  /** Providers on the page; adding and removing with scripts edits this until the next result. */
  let items: Item[] = $derived(
    values.map((provider, index) => ({
      ...provider,
      key: provider.draft || `saved:${provider.id}`,
      issues: Object.fromEntries(
        Object.entries(placement.placed)
          .filter(([path]) => path.startsWith(`${index}.`))
          .map(([path, text]) => [path.slice(`${index}.`.length), text]),
      ),
    })),
  );

  let added = 0;
  const add = (event: MouseEvent) => {
    event.preventDefault();
    if (items.length >= SSO_PROVIDERS_MAX) return;
    added += 1;
    const draft = `client-${Date.now().toString(36)}-${added}`;
    items = [...items, { ...blankProvider(draft), key: draft, issues: {} }];
  };
  const remove = (event: MouseEvent, key: string) => {
    event.preventDefault();
    items = items.filter((item) => item.key !== key);
  };

  const methodNames = $derived<Record<string, string>>({
    client_secret_basic: 'client_secret_basic',
    client_secret_post: 'client_secret_post',
    none: m.ssoAuthNone,
  });

  /** Invalid state and descriptions (help text first, then the issue). */
  const described = (
    item: Item,
    id: string,
    field: SsoProviderField,
    help?: string,
  ) => {
    const ids = [help, item.issues[field] && `${id}-error`].filter(Boolean);
    return {
      'aria-invalid': item.issues[field] ? true : undefined,
      'aria-describedby': ids.length ? ids.join(' ') : undefined,
    };
  };
</script>

<svelte:head><title>{m.settingsSso}</title></svelte:head>

{#snippet problem(item: Item, id: string, field: SsoProviderField)}
  {#if item.issues[field]}
    <p id="{id}-error" class="text-xs text-destructive">{item.issues[field]}</p>
  {/if}
{/snippet}

<FormMessage form={summary} />

{#if data.environmentProvider}
  <Alert>
    <AlertDescription
      >{m.ssoEnvironmentProvider(
        data.environmentProvider.name,
      )}</AlertDescription
    >
  </Alert>
{/if}

<Card>
  <CardHeader>
    <CardTitle>{m.ssoProvidersTitle}</CardTitle>
    <CardDescription>{m.ssoProvidersHelp}</CardDescription>
  </CardHeader>
  <CardContent>
    <SettingsForm action="?/save" novalidate class="grid gap-6">
      <!-- The default button: Enter in a field saves instead of removing the first provider. -->
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true"
      ></button>
      <div class="grid gap-2">
        <Label for="redirectUri">{m.ssoRedirectUri}</Label>
        {#if data.redirectUri}
          <div class="flex flex-wrap items-center gap-2">
            <code
              id="redirectUri"
              class="rounded bg-muted p-2 text-sm break-all select-all"
              >{data.redirectUri}</code
            >
            <CopyButton text={data.redirectUri} label={m.ssoCopyRedirectUri} />
          </div>
        {:else}
          <p id="redirectUri" class="text-sm text-destructive">
            {m.ssoRedirectMissing}
          </p>
        {/if}
      </div>

      {#if !items.length}
        <p class="text-sm text-muted-foreground">{m.ssoProvidersEmpty}</p>
      {/if}

      {#each items as item, index (item.key)}
        {@const field = (name: string) => `providers.${index}.${name}`}
        {@const saved = !item.draft}
        <!-- Opens without scripts; new providers, refused ones and a lone provider start open. -->
        <details
          class="group rounded-lg border"
          open={!saved ||
            Object.keys(item.issues).length > 0 ||
            items.length === 1}
        >
          <summary
            class="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium"
          >
            <span>{item.name || item.id || m.ssoNewProvider}</span>
            {#if item.id}<code class="text-xs text-muted-foreground"
                >{item.id}</code
              >{/if}
            {#if !saved}
              <Badge variant="secondary">{m.ssoNotSaved}</Badge>
            {:else if item.enabled}
              <Badge>{m.ssoProviderOn}</Badge>
            {:else}
              <Badge variant="secondary">{m.ssoProviderOff}</Badge>
            {/if}
            {#if Object.keys(item.issues).length}
              <Badge variant="destructive">{m.ssoProviderHasIssues}</Badge>
            {/if}
          </summary>
          <div class="grid gap-4 border-t p-4 sm:grid-cols-2">
            {#if saved}
              <input type="hidden" name={field('id')} value={item.id} />
            {:else}
              <input type="hidden" name={field('draft')} value={item.draft} />
            {/if}
            <label class="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name={field('enabled')}
                checked={item.enabled}
              />
              {m.ssoProviderEnabled}
            </label>
            {@render problem(item, field('enabled'), 'enabled')}
            <div class="grid content-start gap-2">
              <Label for={field('id')}>{m.ssoProviderId}</Label>
              {#if saved}
                <code
                  id={field('id')}
                  class="rounded bg-muted px-2 py-1.5 text-sm"
                  aria-describedby="{field('id')}-help">{item.id}</code
                >
                <p
                  id="{field('id')}-help"
                  class="text-xs text-muted-foreground"
                >
                  {m.ssoProviderIdFixed}
                </p>
              {:else}
                <Input
                  id={field('id')}
                  name={field('id')}
                  maxlength={32}
                  autocomplete="off"
                  placeholder="google"
                  value={item.id}
                  {...described(item, field('id'), 'id', `${field('id')}-help`)}
                />
                <p
                  id="{field('id')}-help"
                  class="text-xs text-muted-foreground"
                >
                  {m.ssoProviderIdHelp}
                </p>
              {/if}
              {@render problem(item, field('id'), 'id')}
            </div>
            <div class="grid content-start gap-2">
              <Label for={field('name')}>{m.ssoName}</Label>
              <Input
                id={field('name')}
                name={field('name')}
                maxlength={64}
                placeholder="Google"
                value={item.name}
                {...described(item, field('name'), 'name')}
              />
              {@render problem(item, field('name'), 'name')}
            </div>
            <div class="grid content-start gap-2">
              <Label for={field('issuer')}>{m.ssoIssuer}</Label>
              <Input
                id={field('issuer')}
                name={field('issuer')}
                type="url"
                maxlength={255}
                placeholder="https://id.example.com"
                value={item.issuer}
                {...described(item, field('issuer'), 'issuer')}
              />
              {@render problem(item, field('issuer'), 'issuer')}
            </div>
            <div class="grid content-start gap-2">
              <Label for={field('clientId')}>{m.ssoClientId}</Label>
              <Input
                id={field('clientId')}
                name={field('clientId')}
                maxlength={255}
                autocomplete="off"
                value={item.clientId}
                {...described(item, field('clientId'), 'clientId')}
              />
              {@render problem(item, field('clientId'), 'clientId')}
            </div>
            <SecretField
              name={field('clientSecret')}
              label={m.ssoClientSecret}
              configured={saved && data.secrets.includes(item.id)}
              removeName={field('clientSecretRemove')}
              helpId="{field('clientSecret')}-help"
              error={item.issues.clientSecret}
            />
            <div class="grid content-start gap-2">
              <Label for={field('authMethod')}>{m.ssoAuthMethod}</Label>
              <NativeSelect
                class="w-full"
                id={field('authMethod')}
                name={field('authMethod')}
                value={item.authMethod}
                {...described(item, field('authMethod'), 'authMethod')}
              >
                {#each OIDC_AUTH_METHODS as method (method)}
                  <NativeSelectOption value={method}
                    >{methodNames[method]}</NativeSelectOption
                  >
                {/each}
              </NativeSelect>
              {@render problem(item, field('authMethod'), 'authMethod')}
            </div>
            <div class="grid content-start gap-2">
              <Label for={field('scopes')}>{m.ssoScopes}</Label>
              <Input
                id={field('scopes')}
                name={field('scopes')}
                maxlength={500}
                value={item.scopes}
                {...described(item, field('scopes'), 'scopes')}
              />
              {@render problem(item, field('scopes'), 'scopes')}
            </div>
            <div class="grid content-start gap-2 sm:col-span-2">
              <Label for={field('allowedSubjects')}
                >{m.ssoAllowedSubjects}</Label
              >
              <Textarea
                id={field('allowedSubjects')}
                name={field('allowedSubjects')}
                rows={3}
                class="font-mono"
                spellcheck={false}
                placeholder="1234567890 = editor@example.com"
                value={item.allowedSubjects}
                {...described(
                  item,
                  field('allowedSubjects'),
                  'allowedSubjects',
                )}
              />
              {@render problem(
                item,
                field('allowedSubjects'),
                'allowedSubjects',
              )}
            </div>
            <div class="sm:col-span-2">
              <!-- Without scripts, posts the form back without this provider (nothing is saved). -->
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                formaction="?/remove"
                name="remove"
                value={String(index)}
                onclick={(event: MouseEvent) => remove(event, item.key)}
              >
                <Trash2 aria-hidden="true" />
                {m.ssoRemoveProvider}
              </Button>
            </div>
          </div>
        </details>
      {/each}

      <div class="flex flex-wrap items-center gap-3">
        <!-- Without scripts, posts the form back with an empty provider (nothing is saved). -->
        <Button
          type="submit"
          variant="outline"
          formaction="?/add"
          disabled={items.length >= SSO_PROVIDERS_MAX}
          onclick={add}
        >
          <Plus aria-hidden="true" />
          {m.ssoAddProvider}
        </Button>
        {#if items.length >= SSO_PROVIDERS_MAX}
          <p class="text-sm text-muted-foreground">
            {m.ssoProvidersMax(SSO_PROVIDERS_MAX)}
          </p>
        {/if}
      </div>

      <div><Button type="submit">{m.save}</Button></div>
    </SettingsForm>
  </CardContent>
</Card>
