<script lang="ts">
  import type { SettingField, SettingValue } from '@cms/sdk';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';

  /** Inputs for declared setting fields (plugin settings and plugin page forms). */
  let {
    fields,
    values,
    idPrefix,
  }: {
    fields: SettingField[];
    values: Record<string, SettingValue>;
    idPrefix: string;
  } = $props();

  const fieldId = (key: string) => `${idPrefix}-${key}`;
</script>

{#each fields as field (field.key)}
  <div class="grid gap-2">
    {#if field.type === 'boolean'}
      <div class="flex items-center gap-3">
        <Switch
          id={fieldId(field.key)}
          name={field.key}
          checked={(values[field.key] ?? field.default) === true}
        />
        <Label for={fieldId(field.key)}>{field.label}</Label>
      </div>
    {:else}
      <Label for={fieldId(field.key)}>{field.label}</Label>
      <Input
        id={fieldId(field.key)}
        name={field.key}
        type={field.type === 'number' ? 'number' : 'text'}
        step="any"
        value={values[field.key] ?? field.default ?? ''}
      />
    {/if}
    {#if field.description}<p class="text-sm text-muted-foreground">
        {field.description}
      </p>{/if}
  </div>
{/each}
