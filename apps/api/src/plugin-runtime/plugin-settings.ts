import { settingValuesSchema } from '@cms/sdk';
import type {
  ResolvedManifest,
  SettingField,
  SettingValue,
  SettingValues,
} from '@cms/sdk';
import { parseInput } from '../shared/validation';
import type { PluginDataRepository } from './ports';

const VALUE_TYPES: Record<SettingField['type'], string> = {
  text: 'string',
  number: 'number',
  boolean: 'boolean',
};

/** Values of the settings a manifest declares. Missing or mistyped values fall back to the default. */
export class PluginSettings {
  constructor(private readonly data: PluginDataRepository) {}

  async values(manifest: ResolvedManifest): Promise<SettingValues> {
    const stored = await this.data.entries(manifest.id, 'settings');
    const values: SettingValues = {};
    for (const field of manifest.settings) {
      const value = stored[field.key];
      if (typeof value === VALUE_TYPES[field.type])
        values[field.key] = value as SettingValues[string];
      else if (field.default !== undefined) values[field.key] = field.default;
    }
    return values;
  }

  /** One declared setting. Only own keys count, so inherited names like `constructor` are undefined. */
  async value(
    manifest: ResolvedManifest,
    key: string,
  ): Promise<SettingValue | undefined> {
    const values = await this.values(manifest);

    return Object.hasOwn(values, key) ? values[key] : undefined;
  }

  async update(manifest: ResolvedManifest, input: unknown): Promise<void> {
    const values = parseInput(settingValuesSchema(manifest.settings), input);
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined)
        await this.data.set(manifest.id, 'settings', key, value);
    }
  }
}
