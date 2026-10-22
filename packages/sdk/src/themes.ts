import { z } from 'zod';
import { KEBAB_CASE } from '#sdk/common';
import { Errors } from '#sdk/errors';
import { parseBlocks, walkBlocks, SLUG, TEMPLATE_NAME } from '#sdk/blocks';
import type { Block } from '#sdk/blocks';

/**
 * Block themes, modelled on WordPress block themes: `theme.json` (settings and styles),
 * `templates/*.json` and `parts/*.json` (block trees, see `#sdk/blocks`) and an optional
 * `style.css`. A theme is data: blocks are rendered by the core, and the stylesheet is checked
 * so it cannot load anything or reach outside the site (`themeCssSchema`).
 */

/** A color: exactly `#rrggbb`. */
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #1a2b3c');

/** Plain text shown to people; angle brackets are refused so no markup can ride along. */
const plainText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^<>]*$/, 'Must be plain text');

const slug = z
  .string()
  .max(32)
  .regex(SLUG, 'Use lowercase letters, numbers and dashes');

/** A CSS length such as `42rem` or `720px`. */
const length = z
  .string()
  .regex(/^\d{1,4}(\.\d{1,2})?(px|rem|em|ch|vw|%)$/, 'Use a length like 42rem');

/** A font stack such as `"Inter", system-ui, sans-serif`: names, quotes and commas only. */
const fontStack = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9 ,'"-]+$/, 'Use font names separated by commas');

/** Palette slugs every theme defines; the site's interface colors come from these. */
export const THEME_COLOR_ROLES = [
  'base',
  'surface',
  'contrast',
  'muted',
  'accent',
  'border',
] as const;

export const THEME_FONT_SIZES = ['small', 'medium', 'large'] as const;
export const THEME_LINE_HEIGHTS = ['tight', 'normal', 'relaxed'] as const;
export const THEME_RADII = ['none', 'small', 'medium', 'large'] as const;
export const TEMPLATE_PART_AREAS = [
  'header',
  'footer',
  'uncategorized',
] as const;

const paletteSchema = z
  .array(z.strictObject({ slug, name: plainText(1, 50), color }))
  .min(1)
  .max(32)
  .superRefine((palette, ctx) => {
    const slugs = palette.map((entry) => entry.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: 'custom', message: Errors.ThemePaletteDuplicate });
    for (const role of THEME_COLOR_ROLES)
      if (!slugs.includes(role))
        ctx.addIssue({
          code: 'custom',
          message: Errors.ThemePaletteRole(role),
        });
  });

const fontFamiliesSchema = z
  .array(
    z.strictObject({ slug, name: plainText(1, 50), fontFamily: fontStack }),
  )
  .min(1)
  .max(8);

/** Global styles (WordPress `styles`): which fonts and sizes the site uses. */
export const themeStylesSchema = z.strictObject({
  fontFamily: slug,
  headingFontFamily: slug.or(z.literal('')).default(''),
  fontSize: z.enum(THEME_FONT_SIZES).default('medium'),
  lineHeight: z.enum(THEME_LINE_HEIGHTS).default('normal'),
  radius: z.enum(THEME_RADII).default('medium'),
});
export type ThemeStyles = z.output<typeof themeStylesSchema>;

const templatePartSchema = z.strictObject({
  slug: z.string().max(64).regex(SLUG),
  title: plainText(1, 100),
  area: z.enum(TEMPLATE_PART_AREAS).default('uncategorized'),
});

/** `theme.json`. */
export const themeManifestSchema = z
  .strictObject({
    id: z.string().max(64).regex(KEBAB_CASE),
    name: plainText(1, 100),
    version: z
      .string()
      .max(32)
      .regex(/^[0-9A-Za-z][0-9A-Za-z.+-]*$/, 'Invalid version'),
    description: plainText(0, 500).default(''),
    author: plainText(0, 100).default(''),
    settings: z.strictObject({
      color: z.strictObject({ palette: paletteSchema }),
      typography: z.strictObject({ fontFamilies: fontFamiliesSchema }),
      layout: z
        .strictObject({
          contentSize: length.default('42rem'),
          wideSize: length.default('72rem'),
        })
        .default({ contentSize: '42rem', wideSize: '72rem' }),
    }),
    styles: themeStylesSchema,
    templateParts: z.array(templatePartSchema).max(32).default([]),
  })
  .superRefine((manifest, ctx) => {
    const fonts = manifest.settings.typography.fontFamilies.map((f) => f.slug);
    for (const key of ['fontFamily', 'headingFontFamily'] as const) {
      const value = manifest.styles[key];
      if (value && !fonts.includes(value))
        ctx.addIssue({
          code: 'custom',
          path: ['styles', key],
          message: Errors.ThemeFontUnknown,
        });
    }
  });
export type ThemeManifest = z.output<typeof themeManifestSchema>;
export type ThemeManifestInput = z.input<typeof themeManifestSchema>;
export type ThemePaletteColor =
  ThemeManifest['settings']['color']['palette'][number];

/** A block list, validated by `parseBlocks` with every problem reported. */
export const blockListSchema = z.unknown().transform((value, ctx): Block[] => {
  const { blocks, issues } = parseBlocks(value);
  for (const issue of issues.slice(0, 20))
    ctx.addIssue({
      code: 'custom',
      message: Errors.BlockIssue(issue.path, issue.message),
    });
  return issues.length ? z.NEVER : blocks;
});

const templatesSchema = z
  .record(
    z.string().regex(TEMPLATE_NAME, 'Unknown template name'),
    blockListSchema,
  )
  .refine(
    (templates) => Object.keys(templates).length <= 64,
    'Too many templates',
  );

const partsSchema = z
  .record(z.string().max(64).regex(SLUG), blockListSchema)
  .refine(
    (parts) => Object.keys(parts).length <= 32,
    'Too many template parts',
  );

export const THEME_CSS_MAX = 64 * 1024;

/**
 * The reason a stylesheet is refused, or `null`. It may not load anything (`@import`, `url()`,
 * `image-set()`), use escapes (which could spell those) or markup, and its braces must balance
 * outside comments and strings, because the site wraps it in `@scope (.cms-site) { … }`.
 */
export const cssProblem = (css: string): string | null => {
  if (css.length > THEME_CSS_MAX) return 'The stylesheet is too large';
  if (/[<\\]/.test(css)) return 'Markup and escapes are not allowed';
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (plain.includes('/*')) return 'Unclosed comment';
  if (
    /@import|url\s*\(|image-set\s*\(|expression\s*\(|javascript:|@charset|@namespace|behavior\s*:|-moz-binding/i.test(
      plain,
    )
  )
    return 'The stylesheet may not load other resources';
  let depth = 0;
  let quote = '';
  for (const char of plain) {
    if (quote) {
      if (char === quote) quote = '';
      else if (char === '\n') return 'Unclosed string';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth < 0) return 'Unbalanced braces';
  }
  if (quote) return 'Unclosed string';
  return depth === 0 ? null : 'Unbalanced braces';
};

/** `style.css`, without comments (they could hide braces from a reader, not from browsers). */
export const themeCssSchema = z
  .string()
  .superRefine((css, ctx) => {
    const problem = cssProblem(css);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  })
  .transform((css) => css.replace(/\/\*[\s\S]*?\*\//g, '').trim());

/** A complete theme as installed: what the uploaded archive contains, validated. */
export const themePackageSchema = z
  .strictObject({
    manifest: themeManifestSchema,
    templates: templatesSchema,
    parts: partsSchema.default({}),
    css: themeCssSchema.default(''),
  })
  .superRefine((theme, ctx) => {
    if (
      [
        ...walkBlocks([
          ...Object.values(theme.templates).flat(),
          ...Object.values(theme.parts).flat(),
        ]),
      ].filter((block) => block.name === 'query' && !block.attrs.inherit)
        .length > 32
    )
      ctx.addIssue({ code: 'custom', message: Errors.ThemeQueriesLimit });
    if (!theme.templates.index)
      ctx.addIssue({
        code: 'custom',
        path: ['templates'],
        message: Errors.ThemeIndexRequired,
      });
  });
export type ThemePackage = z.output<typeof themePackageSchema>;
export type ThemePackageInput = z.input<typeof themePackageSchema>;

/** An administrator's changes to a theme in the site editor; theme files are never edited. */
export const themeCustomizationSchema = z.strictObject({
  templates: z
    .record(z.string().regex(TEMPLATE_NAME), blockListSchema)
    .default({}),
  parts: z.record(z.string().max(64).regex(SLUG), blockListSchema).default({}),
  /** Palette colors by slug. */
  colors: z.record(slug, color).default({}),
  styles: themeStylesSchema.partial().default({}),
});
export type ThemeCustomization = z.output<typeof themeCustomizationSchema>;

/** Site editor: global styles input. Colors may only change existing palette slugs. */
export const themeStylesInputSchema = z.strictObject({
  colors: z.record(slug, color),
  styles: themeStylesSchema,
});
export type ThemeStylesInput = z.input<typeof themeStylesInputSchema>;

export const themeBlocksInputSchema = z.strictObject({
  blocks: blockListSchema,
});

const settingsShape = z.strictObject({
  palette: z.array(z.strictObject({ slug, name: z.string(), color })),
  fontFamilies: z.array(
    z.strictObject({ slug, name: z.string(), fontFamily: fontStack }),
  ),
  layout: z.strictObject({ contentSize: length, wideSize: length }),
});

const publicPartSchema = z.strictObject({
  slug: z.string(),
  area: z.enum(TEMPLATE_PART_AREAS),
  blocks: blockListSchema,
});

/** The active (or previewed) theme as the public site renders it, site-editor changes applied. */
export const publicThemeSchema = z
  .strictObject({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    settings: settingsShape,
    styles: themeStylesSchema,
    templates: z.record(z.string().regex(TEMPLATE_NAME), blockListSchema),
    parts: z.array(publicPartSchema),
    css: themeCssSchema,
    /** Shown because an administrator is previewing it, not because it is active. */
    preview: z.boolean(),
  })
  .superRefine((theme, ctx) => {
    if (
      [
        ...walkBlocks([
          ...Object.values(theme.templates).flat(),
          ...theme.parts.flatMap((part) => part.blocks),
        ]),
      ].filter((block) => block.name === 'query' && !block.attrs.inherit)
        .length > 32
    )
      ctx.addIssue({ code: 'custom', message: Errors.ThemeQueriesLimit });
  });
export type PublicTheme = z.output<typeof publicThemeSchema>;
export type PublicThemePart = PublicTheme['parts'][number];

/** A signed, short-lived permission to see an inactive theme on the public site. */
export const themePreviewSchema = z.object({ token: z.string() });

/** A theme as listed in the admin API. */
export const adminThemeSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  palette: settingsShape.shape.palette,
  templateCount: z.number().int().nonnegative(),
  active: z.boolean(),
  builtin: z.boolean(),
  customized: z.boolean(),
});
export type AdminTheme = z.output<typeof adminThemeSchema>;

/** Everything the site editor shows for one theme. */
export const themeEditorSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  settings: settingsShape,
  styles: z.strictObject({
    theme: themeStylesSchema,
    current: themeStylesSchema,
    colors: z.record(slug, color),
    customized: z.boolean(),
  }),
  templates: z.array(
    z.strictObject({
      name: z.string().regex(TEMPLATE_NAME),
      blocks: blockListSchema,
      /** Shipped by the theme (resetting restores it) rather than added in the editor. */
      inTheme: z.boolean(),
      customized: z.boolean(),
    }),
  ),
  parts: z.array(
    z.strictObject({
      slug: z.string(),
      title: z.string(),
      area: z.enum(TEMPLATE_PART_AREAS),
      blocks: blockListSchema,
      inTheme: z.boolean(),
      customized: z.boolean(),
    }),
  ),
});
export type ThemeEditor = z.output<typeof themeEditorSchema>;
