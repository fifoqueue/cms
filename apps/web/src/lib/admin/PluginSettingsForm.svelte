<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PluginInfo } from '@cms/sdk';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';

  /** Generic form built from the plugin's declared setting fields. Knows nothing about any plugin. */
  let { plugin }: { plugin: PluginInfo } = $props();

  const fieldId = (key: string) => `${plugin.id}-${key}`;
</script>

<form
  method="POST"
  action="?/settings"
  use:enhance={() =>
    ({ update }) =>
      update({ reset: false })}
  class="space-y-4"
>
  <input type="hidden" name="id" value={plugin.id} />
  {#each plugin.settings as field (field.key)}
    <div class="grid gap-2">
      {#if field.type === 'boolean'}
        <div class="flex items-center gap-3">
          <Switch
            id={fieldId(field.key)}
            name={field.key}
            checked={plugin.values[field.key] === true}
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
          value={plugin.values[field.key] ?? ''}
        />
      {/if}
      {#if field.description}<p class="text-sm text-muted-foreground">
          {field.description}
        </p>{/if}
    </div>
  {/each}
  <Button type="submit" size="sm">Save settings</Button>
</form>
