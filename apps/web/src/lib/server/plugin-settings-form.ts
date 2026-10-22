import type { SettingField, SettingValues } from '@cms/sdk';
import { text } from '#lib/server/errors.js';

/** Reads `PluginSettingsForm.svelte` fields according to the plugin's own field definitions. */
export const readPluginSettings = (
  fields: readonly SettingField[],
  form: FormData,
): SettingValues => {
  const values: SettingValues = {};
  for (const field of fields) {
    if (field.type === 'boolean') {
      values[field.key] = form.has(field.key);
    } else if (field.type === 'number') {
      const raw = text(form, field.key).trim();
      if (raw !== '') values[field.key] = Number(raw);
    } else {
      values[field.key] = text(form, field.key);
    }
  }
  return values;
};
