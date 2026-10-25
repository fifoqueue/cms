<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { flattenTree } from '#lib/admin/taxonomy-tree.js';
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
  import { Separator } from '#lib/components/ui/separator/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';
  import { pluralLabel, statusLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const toc = $derived(data.writing.autoToc);
  // svelte-ignore state_referenced_locally
  let enabled = $state(data.writing.autoToc.enabled);
  // svelte-ignore state_referenced_locally
  let collapsible = $state(data.writing.autoToc.collapsible);
  // svelte-ignore state_referenced_locally
  let open = $state(data.writing.autoToc.open);
  // Saved keys of since-removed types stay listed so saving keeps them unless unchecked.
  const types = $derived([
    ...data.types,
    // Deduplicated: older comma-separated saves may repeat a key, and the list is keyed.
    ...[...new Set(toc.types)]
      .filter((key) => !data.types.some((type) => type.key === key))
      .map((key) => ({ key, pluralName: key })),
  ]);
</script>

<svelte:head><title>{m.settingsWriting}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.settingsWriting}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm action="?/save" class="grid gap-6">
      <div class="grid gap-2">
        <Label for="defaultCategoryId">{m.writingDefaultCategory}</Label>
        <NativeSelect
          class="w-full"
          id="defaultCategoryId"
          name="defaultCategoryId"
          value={data.writing.defaultCategoryId ?? ''}
        >
          <NativeSelectOption value="">{m.none}</NativeSelectOption>
          {#each flattenTree(data.categories) as { term, depth } (term.id)}
            <NativeSelectOption value={term.id}
              >{' '.repeat(depth * 3)}{term.name}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <div class="grid gap-2">
        <Label for="defaultStatus">{m.writingDefaultStatus}</Label>
        <NativeSelect
          class="w-full"
          id="defaultStatus"
          name="defaultStatus"
          value={data.writing.defaultStatus}
        >
          {#each ['draft', 'pending'] as const as status (status)}
            <NativeSelectOption value={status}
              >{statusLabel(m, status)}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <Separator />
      <section class="grid gap-6" aria-labelledby="toc-heading">
        <div class="grid gap-1">
          <h2 id="toc-heading" class="text-base font-medium">
            {m.writingToc}
          </h2>
          <p class="text-sm text-muted-foreground">{m.writingTocHelp}</p>
        </div>
        <div class="flex items-center gap-3">
          <Switch id="tocEnabled" name="tocEnabled" bind:checked={enabled} />
          <Label for="tocEnabled">{m.writingTocEnabled}</Label>
        </div>
        <fieldset class="grid gap-2">
          <legend class="mb-2 text-sm font-medium">{m.writingTocTypes}</legend>
          <div class="flex flex-wrap gap-x-6 gap-y-2">
            {#each types as type (type.key)}
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  name="tocTypes"
                  value={type.key}
                  checked={toc.types.includes(type.key)}
                />
                {pluralLabel(m, type)}
              </label>
            {/each}
          </div>
        </fieldset>
        <fieldset class="grid gap-2">
          <legend class="mb-2 text-sm font-medium">{m.writingTocLevels}</legend>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {#each [1, 2, 3, 4, 5, 6] as level (level)}
              <label
                class="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium has-checked:border-primary has-checked:bg-accent"
              >
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  name="tocLevels"
                  value={level}
                  checked={toc.levels.includes(level)}
                />
                H{level}
              </label>
            {/each}
          </div>
        </fieldset>
        <div class="grid gap-2">
          <Label for="tocTitle">{m.writingTocTitle}</Label>
          <Input
            id="tocTitle"
            name="tocTitle"
            maxlength={200}
            placeholder={m.contentTocDefaultTitle}
            value={toc.title}
            aria-describedby="tocTitle-help"
          />
          <p id="tocTitle-help" class="text-xs text-muted-foreground">
            {m.writingTocTitleHelp}
          </p>
        </div>
        <div class="grid items-start gap-4 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label for="tocPosition">{m.writingTocPosition}</Label>
            <NativeSelect
              class="w-full"
              id="tocPosition"
              name="tocPosition"
              value={toc.position}
            >
              <NativeSelectOption value="beforeFirstHeading"
                >{m.writingTocBefore}</NativeSelectOption
              >
              <NativeSelectOption value="top"
                >{m.writingTocTop}</NativeSelectOption
              >
            </NativeSelect>
          </div>
          <div class="grid gap-2">
            <Label for="tocMinimum">{m.writingTocMinimum}</Label>
            <Input
              id="tocMinimum"
              name="tocMinimum"
              type="number"
              min={0}
              max={100}
              required
              value={toc.minHeadings}
              aria-describedby="tocMinimum-help"
            />
            <p id="tocMinimum-help" class="text-xs text-muted-foreground">
              {m.writingTocMinimumHelp}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <Switch
            id="tocCollapsible"
            name="tocCollapsible"
            bind:checked={collapsible}
          />
          <Label for="tocCollapsible">{m.writingTocCollapsible}</Label>
        </div>
        <div class="grid gap-1">
          <div class="flex items-center gap-3">
            <!-- Without collapsing the choice is moot; keep the saved value for later. -->
            <Switch
              id="tocOpen"
              name={collapsible ? 'tocOpen' : undefined}
              disabled={!collapsible}
              bind:checked={open}
              aria-describedby="tocOpen-help"
            />
            <Label for="tocOpen">{m.writingTocOpen}</Label>
          </div>
          {#if !collapsible && open}
            <input type="hidden" name="tocOpen" value="on" />
          {/if}
          <p id="tocOpen-help" class="ml-11 text-xs text-muted-foreground">
            {m.writingTocOpenHelp}
          </p>
        </div>
      </section>
      <div><Button type="submit">{m.save}</Button></div>
    </SettingsForm>
  </CardContent>
</Card>
