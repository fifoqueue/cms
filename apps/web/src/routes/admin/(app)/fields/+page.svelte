<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { FIELD_TYPES } from '@cms/sdk';
  import type { ContentTypeDefinition, FieldDefinition } from '@cms/sdk';
  import FormMessage from '#lib/admin/FormMessage.svelte';
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
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { fieldKindLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };
  const keep: SubmitFunction =
    () =>
    ({ update }) =>
      update({ reset: false });
</script>

{#snippet typeForm(type: ContentTypeDefinition | null)}
  <form
    method="POST"
    action="?/saveType"
    use:enhance={type ? keep : undefined}
    class="grid gap-4 sm:grid-cols-2"
  >
    <input type="hidden" name="original" value={type?.key ?? ''} />
    <div class="grid gap-2">
      <Label for="type-key-{type?.key ?? 'new'}">{m.typeKey}</Label>
      <Input
        id="type-key-{type?.key ?? 'new'}"
        name="key"
        required
        maxlength={32}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        value={type?.key ?? ''}
        readonly={!!type}
        aria-describedby="type-key-help-{type?.key ?? 'new'}"
      />
      <p
        id="type-key-help-{type?.key ?? 'new'}"
        class="text-xs text-muted-foreground"
      >
        {m.typeKeyHelp}
      </p>
    </div>
    <div class="grid gap-2">
      <Label for="type-name-{type?.key ?? 'new'}">{m.typeName}</Label>
      <Input
        id="type-name-{type?.key ?? 'new'}"
        name="name"
        required
        maxlength={64}
        value={type?.name ?? ''}
      />
    </div>
    <div class="grid gap-2">
      <Label for="type-plural-{type?.key ?? 'new'}">{m.typePluralName}</Label>
      <Input
        id="type-plural-{type?.key ?? 'new'}"
        name="pluralName"
        required
        maxlength={64}
        value={type?.pluralName ?? ''}
      />
    </div>
    <div class="grid gap-2">
      <Label for="type-description-{type?.key ?? 'new'}"
        >{m.typeDescription}</Label
      >
      <Input
        id="type-description-{type?.key ?? 'new'}"
        name="description"
        maxlength={500}
        value={type?.description ?? ''}
      />
    </div>
    <div class="flex flex-wrap gap-4 text-sm sm:col-span-2">
      <label class="flex items-center gap-2"
        ><input
          type="checkbox"
          name="archive"
          checked={type?.archive ?? true}
        />
        {m.typeArchive}</label
      >
      <label class="flex items-center gap-2"
        ><input
          type="checkbox"
          name="searchable"
          checked={type?.searchable ?? true}
        />
        {m.typeSearchable}</label
      >
    </div>
    <fieldset class="flex flex-wrap gap-4 text-sm sm:col-span-2">
      <legend class="mb-2 font-medium">{m.typeSupports}</legend>
      {#each [['categories', m.supportsCategories], ['tags', m.supportsTags], ['comments', m.supportsComments], ['featuredImage', m.supportsFeaturedImage]] as const as [key, label] (key)}
        <label class="flex items-center gap-2"
          ><input
            type="checkbox"
            name="supports.{key}"
            checked={type?.supports[key] ?? true}
          />
          {label}</label
        >
      {/each}
    </fieldset>
    <div class="sm:col-span-2">
      <Button type="submit">{type ? m.save : m.typeAdd}</Button>
    </div>
  </form>
{/snippet}

{#snippet fieldForm(field: FieldDefinition | null)}
  {@const id = field?.key ?? 'new'}
  <form
    method="POST"
    action="?/saveField"
    use:enhance={field ? keep : undefined}
    class="grid gap-4 sm:grid-cols-2"
  >
    <input type="hidden" name="original" value={field?.key ?? ''} />
    <div class="grid gap-2">
      <Label for="field-key-{id}">{m.fieldKey}</Label>
      <Input
        id="field-key-{id}"
        name="key"
        required
        maxlength={64}
        pattern="[a-z][a-z0-9_]*"
        value={field?.key ?? ''}
        readonly={!!field}
        aria-describedby="field-key-help-{id}"
      />
      <p id="field-key-help-{id}" class="text-xs text-muted-foreground">
        {m.fieldKeyHelp}
      </p>
    </div>
    <div class="grid gap-2">
      <Label for="field-label-{id}">{m.fieldLabel}</Label>
      <Input
        id="field-label-{id}"
        name="label"
        required
        maxlength={100}
        value={field?.label ?? ''}
      />
    </div>
    <div class="grid gap-2">
      <Label for="field-type-{id}">{m.fieldTypeLabel}</Label>
      <NativeSelect
        class="w-full"
        id="field-type-{id}"
        name="type"
        value={field?.type ?? 'text'}
      >
        {#each FIELD_TYPES as kind (kind)}
          <NativeSelectOption value={kind}
            >{fieldKindLabel(m, kind)}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    </div>
    <div class="grid gap-2">
      <Label for="field-help-{id}">{m.fieldHelp}</Label>
      <Input
        id="field-help-{id}"
        name="help"
        maxlength={300}
        value={field?.help ?? ''}
      />
    </div>
    <div class="grid gap-2 sm:col-span-2">
      <Label for="field-options-{id}">{m.fieldOptions}</Label>
      <Textarea
        id="field-options-{id}"
        name="options"
        rows={3}
        value={field?.options.join('\n') ?? ''}
      />
    </div>
    <fieldset class="flex flex-wrap gap-4 text-sm sm:col-span-2">
      <legend class="mb-2 font-medium">{m.fieldTypes}</legend>
      {#each data.types as type (type.key)}
        <label class="flex items-center gap-2"
          ><input
            type="checkbox"
            name="contentTypes"
            value={type.key}
            checked={field?.contentTypes.includes(type.key) ?? false}
          />
          {type.name}</label
        >
      {/each}
    </fieldset>
    <div class="flex flex-wrap gap-4 text-sm sm:col-span-2">
      <label class="flex items-center gap-2"
        ><input
          type="checkbox"
          name="required"
          checked={field?.required ?? false}
        />
        {m.fieldRequired}</label
      >
      <label class="flex items-center gap-2"
        ><input type="checkbox" name="public" checked={field?.public ?? true} />
        {m.fieldPublic}</label
      >
    </div>
    <div class="sm:col-span-2">
      <Button type="submit">{field ? m.save : m.fieldAdd}</Button>
    </div>
  </form>
{/snippet}

<svelte:head><title>{m.fieldsTitle}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.fieldsTitle}</h1>
<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.typesTitle}</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    <ul class="divide-y rounded-md border">
      {#each data.types as type (type.key)}
        <li class="p-3">
          {#if type.builtin}
            <p class="font-medium">
              {type.name}
              <Badge variant="secondary" class="ml-1">{m.builtin}</Badge>
              <code class="ml-2 text-xs text-muted-foreground">{type.key}</code>
            </p>
          {:else}
            <details>
              <summary class="cursor-pointer font-medium">
                {type.name}
                <code class="ml-2 text-xs text-muted-foreground"
                  >{type.key}</code
                >
              </summary>
              <div class="mt-4 space-y-4">
                {@render typeForm(type)}
                <form
                  method="POST"
                  action="?/deleteType"
                  use:enhance={confirmDelete}
                >
                  <input type="hidden" name="key" value={type.key} />
                  <Button type="submit" variant="destructive" size="sm"
                    >{m.delete}</Button
                  >
                </form>
              </div>
            </details>
          {/if}
        </li>
      {/each}
    </ul>
    <details>
      <summary class="cursor-pointer text-sm font-medium">{m.typeAdd}</summary>
      <div class="mt-4">{@render typeForm(null)}</div>
    </details>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.customFieldsTitle}</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    {#if data.fields.length}
      <ul class="divide-y rounded-md border">
        {#each data.fields as field (field.key)}
          <li class="p-3">
            <details>
              <summary class="cursor-pointer">
                <span class="font-medium">{field.label}</span>
                <code class="ml-2 text-xs text-muted-foreground"
                  >{field.key}</code
                >
                <Badge variant="outline" class="ml-2"
                  >{fieldKindLabel(m, field.type)}</Badge
                >
              </summary>
              <div class="mt-4 space-y-4">
                {@render fieldForm(field)}
                <form
                  method="POST"
                  action="?/deleteField"
                  use:enhance={confirmDelete}
                >
                  <input type="hidden" name="key" value={field.key} />
                  <Button type="submit" variant="destructive" size="sm"
                    >{m.delete}</Button
                  >
                </form>
              </div>
            </details>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground">{m.fieldsEmpty}</p>
    {/if}
    <details>
      <summary class="cursor-pointer text-sm font-medium">{m.fieldAdd}</summary>
      <div class="mt-4">{@render fieldForm(null)}</div>
    </details>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.customTaxonomies}</CardTitle></CardHeader>
  <CardContent class="space-y-4">
    {#each data.taxonomies.filter((taxonomy) => taxonomy.key !== 'category' && taxonomy.key !== 'tag') as taxonomy (taxonomy.key)}
      <form
        method="POST"
        action="?/saveTaxonomy"
        use:enhance
        class="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="key" value={taxonomy.key} />
        <input
          type="hidden"
          name="hierarchical"
          disabled={!taxonomy.hierarchical}
        />
        <label class="grid gap-1"
          >{m.name}<Input name="name" value={taxonomy.name} required /></label
        >
        <Button type="submit" variant="outline">{m.save}</Button>
        <Button
          href={resolve('/admin/(app)/taxonomies/[taxonomy]', {
            taxonomy: taxonomy.key,
          })}
          variant="outline">{m.manageTerms}</Button
        >
      </form>
    {/each}
    <form
      method="POST"
      action="?/saveTaxonomy"
      use:enhance
      class="grid gap-3 sm:grid-cols-2"
    >
      <label class="grid gap-1"
        >{m.taxonomyKey}<Input
          name="key"
          required
          maxlength={32}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        /></label
      >
      <label class="grid gap-1"
        >{m.name}<Input name="name" required maxlength={100} /></label
      >
      <label class="flex items-center gap-2"
        ><input
          type="checkbox"
          name="hierarchical"
          checked
        />{m.taxonomyHierarchy}</label
      >
      <Button type="submit">{m.addTaxonomy}</Button>
    </form>
  </CardContent>
</Card>
