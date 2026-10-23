<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PluginInfo } from '@cms/sdk';
  import SettingFields from '#lib/admin/SettingFields.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  /** Generic form built from the plugin's declared setting fields. Knows nothing about any plugin. */
  let { plugin }: { plugin: Pick<PluginInfo, 'id' | 'settings' | 'values'> } =
    $props();

  const i18n = useI18n();
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
  <SettingFields
    fields={plugin.settings}
    values={plugin.values}
    idPrefix={plugin.id}
  />
  <Button type="submit" size="sm">{i18n.m.saveSettings}</Button>
</form>
