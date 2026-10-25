<script lang="ts">
  import {
    DEFAULT_EMBED_PROVIDERS,
    EMBED_ALLOW_DIRECTIVES,
    embedPermissions,
  } from '@cms/sdk';
  import type { EmbedProviderSettings } from '@cms/sdk';
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { issueText } from '#lib/admin/form-errors.js';
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
  import { Switch } from '#lib/components/ui/switch/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  // svelte-ignore state_referenced_locally
  let providers = $state<EmbedProviderSettings[]>(
    structuredClone(data.settings.providers),
  );
  const issues = $derived(form && 'issues' in form ? (form.issues ?? []) : []);
  const problem = (index: number, field: string) => {
    const message = issues.find(
      (issue) => issue.path === `providers.${index}.${field}`,
    )?.message;
    return message ? issueText(m, i18n.language, message) : undefined;
  };
  const togglePermission = (
    provider: EmbedProviderSettings,
    directive: string,
    checked: boolean,
  ) => {
    const selected = embedPermissions(provider.allow).filter(
      (permission) => permission !== directive,
    );
    if (checked) selected.push(directive);
    provider.allow = selected.join('; ');
  };
  const move = (index: number, direction: number) => {
    const next = [...providers];
    const target = index + direction;
    [next[index], next[target]] = [next[target]!, next[index]!];
    providers = next;
  };
  const add = () => {
    providers = [
      ...providers,
      {
        id: '',
        label: '',
        enabled: true,
        urlPattern: '',
        src: '',
        title: '',
        allow: '',
        sizing: { kind: 'ratio', ratio: '16 / 9' },
      },
    ];
  };
  const fields = $derived([
    { key: 'id', label: m.embedsId },
    { key: 'label', label: m.embedsLabel },
    { key: 'urlPattern', label: m.embedsPattern },
    { key: 'src', label: m.embedsSource },
    { key: 'title', label: m.embedsFrameTitle },
  ] as const);
</script>

<svelte:head><title>{m.embedsTitle}</title></svelte:head>
<FormMessage {form} />
<SettingsForm action="?/save" novalidate class="grid min-w-0 gap-5">
  <input type="hidden" name="settings" value={JSON.stringify({ providers })} />
  <div class="grid gap-3">
    <h2 class="text-lg font-semibold">{m.embedsTitle}</h2>
    <p class="text-sm text-muted-foreground">{m.embedsHelp}</p>
    <p class="text-sm text-muted-foreground">{m.embedsTemplateHelp}</p>
    <div class="flex flex-wrap gap-2">
      <Button type="submit">{m.save}</Button>
      <Button
        type="button"
        variant="outline"
        onclick={() => (providers = structuredClone(DEFAULT_EMBED_PROVIDERS))}
        >{m.embedsRestore}</Button
      >
    </div>
  </div>
  {#each providers as provider, index (index)}
    <Card class="min-w-0">
      <CardHeader class="gap-3">
        <CardTitle class="break-words"
          >{provider.label || m.embedsAdd}</CardTitle
        >
        <div class="flex flex-wrap items-center gap-2">
          <Switch id={`enabled-${index}`} bind:checked={provider.enabled} />
          <Label for={`enabled-${index}`}>{m.embedsEnabled}</Label>
          <div class="ml-auto flex flex-wrap gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === 0}
              onclick={() => move(index, -1)}
              aria-label={m.embedsUp}>↑</Button
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === providers.length - 1}
              onclick={() => move(index, 1)}
              aria-label={m.embedsDown}>↓</Button
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={() =>
                (providers = providers.filter((_, i) => i !== index))}
              >{m.remove}</Button
            >
          </div>
        </div>
      </CardHeader>
      <CardContent class="grid min-w-0 gap-4 sm:grid-cols-2">
        {#each fields as field (field.key)}
          <div
            class:sm:col-span-2={field.key === 'urlPattern' ||
              field.key === 'src'}
            class="grid min-w-0 gap-2"
          >
            <Label for={`${field.key}-${index}`}>{field.label}</Label>
            <Input
              id={`${field.key}-${index}`}
              bind:value={provider[field.key]}
              aria-invalid={!!problem(index, field.key)}
              aria-describedby={problem(index, field.key)
                ? `${field.key}-${index}-error`
                : undefined}
            />
            {#if problem(index, field.key)}
              <p
                id={`${field.key}-${index}-error`}
                class="text-xs text-destructive"
              >
                {problem(index, field.key)}
              </p>
            {/if}
          </div>
        {/each}
        <fieldset
          class="grid gap-2 sm:col-span-2"
          aria-describedby={problem(index, 'allow')
            ? `allow-${index}-error`
            : undefined}
        >
          <legend class="mb-2 text-sm font-medium">{m.embedsAllow}</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each EMBED_ALLOW_DIRECTIVES as directive (directive)}
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={embedPermissions(provider.allow).includes(directive)}
                  onchange={(event) =>
                    togglePermission(
                      provider,
                      directive,
                      event.currentTarget.checked,
                    )}
                />
                {directive}
              </label>
            {/each}
          </div>
          {#if problem(index, 'allow')}
            <p id={`allow-${index}-error`} class="text-xs text-destructive">
              {problem(index, 'allow')}
            </p>
          {/if}
        </fieldset>
        <div class="grid gap-2">
          <Label for={`sizing-${index}`}>{m.embedsSizing}</Label>
          <NativeSelect
            id={`sizing-${index}`}
            class="w-full"
            value={provider.sizing.kind}
            onchange={(event) =>
              (provider.sizing =
                event.currentTarget.value === 'ratio'
                  ? { kind: 'ratio', ratio: '16 / 9' }
                  : { kind: 'height', height: 600 })}
          >
            <NativeSelectOption value="ratio"
              >{m.embedsRatio}</NativeSelectOption
            >
            <NativeSelectOption value="height"
              >{m.embedsHeight}</NativeSelectOption
            >
          </NativeSelect>
        </div>
        {#if provider.sizing.kind === 'ratio'}
          <div class="grid gap-2">
            <Label for={`ratio-${index}`}>{m.embedsRatio}</Label>
            <Input id={`ratio-${index}`} bind:value={provider.sizing.ratio} />
            {#if problem(index, 'sizing.ratio')}<p
                class="text-xs text-destructive"
              >
                {problem(index, 'sizing.ratio')}
              </p>{/if}
          </div>
        {:else}
          <div class="grid gap-2">
            <Label for={`height-${index}`}>{m.embedsHeight}</Label>
            <Input
              id={`height-${index}`}
              type="number"
              min="1"
              max="4096"
              bind:value={provider.sizing.height}
            />
            {#if problem(index, 'sizing.height')}<p
                class="text-xs text-destructive"
              >
                {problem(index, 'sizing.height')}
              </p>{/if}
          </div>
          <div class="grid gap-2 sm:col-span-2">
            <Label for={`path-${index}`}>{m.embedsHeightPath}</Label>
            <Input
              id={`path-${index}`}
              bind:value={provider.sizing.heightMessagePath}
            />
            {#if problem(index, 'sizing.heightMessagePath')}<p
                class="text-xs text-destructive"
              >
                {problem(index, 'sizing.heightMessagePath')}
              </p>{/if}
          </div>
        {/if}
      </CardContent>
    </Card>
  {/each}
  <div class="flex flex-wrap gap-2">
    <Button
      type="button"
      variant="outline"
      disabled={providers.length >= 50}
      onclick={add}>{m.embedsAdd}</Button
    >
    <Button type="submit">{m.save}</Button>
  </div>
</SettingsForm>
