import { z } from 'zod';
import { KEBAB_CASE } from '#sdk/common';

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

/** A semver range such as `>=1.2.0 <2`. */
const rangeSchema = z.string().trim().min(1).max(100);

export const pluginManifestSchema = z.object({
  id: z.string().max(64).regex(KEBAB_CASE),
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(32),
  description: z.string().max(500).default(''),
  /** Activation fails with an explanation until these are met. */
  requires: z
    .object({
      /** The CMS version range the plugin works with. */
      cms: rangeSchema.optional(),
      /** Plugins that must be active first, with version ranges. */
      plugins: z
        .record(z.string().regex(KEBAB_CASE).max(64), rangeSchema)
        .default({}),
    })
    .default({ plugins: {} }),
  /**
   * An https address answering `{ "version": "…", "download": "https://…" }`, so administrators
   * can check for a newer version. Nothing is downloaded or installed automatically.
   */
  updateUrl: z
    .url({ protocol: /^https$/ })
    .max(500)
    .optional(),
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
export const adminPluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  status: z.enum(['active', 'inactive', 'failed']),
  error: z.string().nullable(),
  /** Whether the plugin names an update address. */
  updatable: z.boolean(),
  settings: z.array(settingFieldSchema),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export type AdminPluginDto = z.output<typeof adminPluginSchema>;
export type PluginInfo = AdminPluginDto;

/** A plugin's update address answer. */
export const pluginUpdateManifestSchema = z.object({
  version: z.string().min(1).max(32),
  download: z
    .url({ protocol: /^https$/ })
    .max(500)
    .optional(),
});

export const pluginUpdateSchema = z.object({
  current: z.string(),
  latest: z.string(),
  newer: z.boolean(),
  download: z.string().nullable(),
});

export type PluginUpdate = z.output<typeof pluginUpdateSchema>;

const shortText = z.string().max(500);

/**
 * What a plugin admin page shows. The admin area lays blocks out itself, so plugins never send
 * markup or scripts to signed-in users.
 */
export const adminBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text: shortText }),
  z.object({ kind: z.literal('text'), text: z.string().max(5000) }),
  z.object({
    kind: z.literal('notice'),
    tone: z.enum(['info', 'success', 'warning']),
    text: z.string().max(2000),
  }),
  z.object({
    kind: z.literal('stats'),
    items: z.array(z.object({ label: shortText, value: shortText })).max(12),
  }),
  z.object({
    kind: z.literal('table'),
    columns: z.array(shortText).max(12),
    rows: z.array(z.array(shortText).max(12)).max(500),
  }),
  z.object({
    kind: z.literal('form'),
    /** The page action that receives the values. */
    action: z.string().regex(KEBAB_CASE).max(64),
    submit: z.string().min(1).max(100),
    fields: z.array(settingFieldSchema).max(30),
  }),
]);

export type AdminBlock = z.output<typeof adminBlockSchema>;

export const adminPageBlocksSchema = z.array(adminBlockSchema).max(100);

export const pluginPageSummarySchema = z.object({
  plugin: z.string(),
  key: z.string(),
  title: z.string(),
});

export type PluginPageSummary = z.output<typeof pluginPageSummarySchema>;

export const pluginPageSchema = pluginPageSummarySchema.extend({
  blocks: adminPageBlocksSchema,
});

export type PluginPage = z.output<typeof pluginPageSchema>;

/**
 * A plugin's dashboard widget, rendered for the viewer. Display blocks only (`form` blocks are
 * dropped: widgets have no actions; a plugin page can host them).
 */
export const dashboardWidgetSchema = pluginPageSummarySchema.extend({
  blocks: z
    .array(adminBlockSchema)
    .max(30)
    .refine((blocks) => blocks.every((block) => block.kind !== 'form')),
});

export type DashboardWidget = z.output<typeof dashboardWidgetSchema>;

export const pluginPageResultSchema = z.object({
  notice: z.string().max(500).nullable(),
});
