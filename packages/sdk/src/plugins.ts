import { z } from 'zod';
import { KEBAB_CASE } from './common';

const fieldBase = {
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .max(64),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
};

/** A plugin setting. The admin UI renders a form from these without knowing the plugin. */
export const settingFieldSchema = z.discriminatedUnion('type', [
  z.object({
    ...fieldBase,
    type: z.literal('text'),
    default: z.string().max(5000).optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal('number'),
    default: z.number().optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal('boolean'),
    default: z.boolean().optional(),
  }),
]);

export type SettingField = z.output<typeof settingFieldSchema>;
export type SettingValue = string | number | boolean;
export type SettingValues = Record<string, SettingValue>;

export const pluginManifestSchema = z.object({
  id: z.string().max(64).regex(KEBAB_CASE),
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(32),
  description: z.string().max(500).default(''),
  settings: z
    .array(settingFieldSchema)
    .max(50)
    .default([])
    .refine(
      (fields) =>
        new Set(fields.map((field) => field.key)).size === fields.length,
      'Setting keys must be unique',
    ),
});

/** What a plugin author writes. */
export type PluginManifest = z.input<typeof pluginManifestSchema>;
/** A validated manifest, with defaults applied. */
export type ResolvedManifest = z.output<typeof pluginManifestSchema>;

const fieldValueSchema = (field: SettingField) => {
  switch (field.type) {
    case 'text':
      return z.string().max(5000);
    case 'number':
      return z.number().finite();
    case 'boolean':
      return z.boolean();
  }
};

/** Validator for a (partial) settings update, derived from the plugin's own fields. */
export const settingValuesSchema = (fields: readonly SettingField[]) =>
  z.strictObject(
    Object.fromEntries(
      fields.map((field) => [field.key, fieldValueSchema(field).optional()]),
    ),
  );

export type PluginStatus = 'active' | 'inactive' | 'failed';

/** A plugin as listed in the admin API. */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  status: PluginStatus;
  error: string | null;
  settings: SettingField[];
  values: SettingValues;
}
