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
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { statusLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.settingsWriting}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.settingsWriting}</CardTitle></CardHeader>
  <CardContent>
    <SettingsForm action="?/save" class="space-y-4">
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
      <Button type="submit">{m.save}</Button>
    </SettingsForm>
  </CardContent>
</Card>
