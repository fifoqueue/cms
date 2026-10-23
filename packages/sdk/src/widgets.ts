import { z } from 'zod';
import { isJsonValue } from '#sdk/common';
import { Errors } from '#sdk/errors';
import { publicMenuItemSchema } from '#sdk/menus';
import { LINK, MEDIA_IMAGE } from '#sdk/blocks';

/** Where themes place widgets. */
export const WIDGET_AREAS = ['sidebar', 'footer'] as const;
export type WidgetArea = (typeof WIDGET_AREAS)[number];

/** Widgets every site has; plugins add types named `plugin:<plugin id>:<name>`. */
export const CORE_WIDGETS = [
  'recentPosts',
  'categories',
  'tags',
  'search',
  'text',
  'menu',
  'archives',
  'recentComments',
  'image',
] as const;
export type CoreWidget = (typeof CORE_WIDGETS)[number];

export const widgetSchema = z.object({
  id: z.string().min(1).max(36),
  type: z.string().min(1).max(160),
  title: z.string().trim().max(191).default(''),
  /** Options of the widget type (count, menu id, text …). */
  settings: z
    .record(z.string().max(64), z.unknown())
    .refine((value) => isJsonValue(value), Errors.FieldValuesInvalid)
    .default({}),
});

export type Widget = z.output<typeof widgetSchema>;

export const widgetsSettingsSchema = z.object({
  sidebar: z.array(widgetSchema).max(30).default([]),
  footer: z.array(widgetSchema).max(30).default([]),
});

export type WidgetsSettings = z.output<typeof widgetsSettingsSchema>;
export type WidgetsSettingsInput = z.input<typeof widgetsSettingsSchema>;

const base = { id: z.string(), title: z.string() };

/** A run of widget text. */
export const richRunSchema = z.object({
  text: z.string(),
  strong: z.boolean().default(false),
  em: z.boolean().default(false),
  /** Site path, `http(s):`, `mailto:` or fragment only (`LINK`). */
  href: z.string().regex(LINK).nullable().default(null),
});

export type RichRun = z.output<typeof richRunSchema>;
const link = z.object({ title: z.string(), path: z.string() });
const term = z.object({
  name: z.string(),
  slug: z.string(),
  count: z.number().int(),
  depth: z.number().int(),
});

/** A widget ready to display: core widgets carry data the theme lays out, plugin widgets HTML. */
export const publicWidgetSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('recentPosts'),
    posts: z.array(link.extend({ publishedAt: z.string() })),
  }),
  z.object({ ...base, kind: z.literal('categories'), terms: z.array(term) }),
  z.object({ ...base, kind: z.literal('tags'), terms: z.array(term) }),
  z.object({ ...base, kind: z.literal('search') }),
  z.object({
    ...base,
    kind: z.literal('text'),
    text: z.string(),
    /** The text's paragraphs as runs: bold, italic and checked links only, never markup. */
    paragraphs: z.array(z.array(richRunSchema)).default([]),
  }),
  z.object({
    ...base,
    kind: z.literal('image'),
    /** A media-library image (`/media/…`). */
    src: z.string().regex(MEDIA_IMAGE),
    alt: z.string(),
    link: z.string().regex(LINK).nullable(),
  }),
  z.object({
    ...base,
    kind: z.literal('menu'),
    items: z.array(publicMenuItemSchema),
  }),
  z.object({
    ...base,
    kind: z.literal('archives'),
    months: z.array(
      z.object({
        year: z.number().int(),
        month: z.number().int(),
        count: z.number().int(),
      }),
    ),
  }),
  z.object({
    ...base,
    kind: z.literal('recentComments'),
    comments: z.array(
      z.object({ author: z.string(), title: z.string(), path: z.string() }),
    ),
  }),
  z.object({ ...base, kind: z.literal('html'), html: z.string() }),
]);

export type PublicWidget = z.output<typeof publicWidgetSchema>;

export const publicWidgetsSchema = z.object({
  sidebar: z.array(publicWidgetSchema),
  footer: z.array(publicWidgetSchema),
});

export type PublicWidgets = z.output<typeof publicWidgetsSchema>;

/** A plugin widget type offered in the Widgets screen. */
export const widgetTypeSchema = z.object({
  type: z.string(),
  name: z.string(),
});
