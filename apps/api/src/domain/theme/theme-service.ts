import {
  TEMPLATE_NAME,
  SLUG,
  publicThemeSchema,
  themeBlocksInputSchema,
  themePackageSchema,
  themeStylesInputSchema,
} from '@cms/sdk';
import type {
  AdminTheme,
  PublicTheme,
  ThemeCustomization,
  ThemeEditor,
  ThemePackage,
  ThemeStyles,
} from '@cms/sdk';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { BUILTIN_THEMES } from '#api/domain/theme/builtin-themes';
import { packageFromFiles } from '#api/domain/theme/theme-archive';
import type { ThemeArchive } from '#api/domain/theme/theme-archive';
import { ThemeScreenshots } from '#api/domain/theme/theme-screenshots';
import type { ImageProcessor } from '#api/domain/media/ports';
import {
  findTheme,
  isBuiltinTheme,
  ThemeStateStore,
} from '#api/domain/theme/theme-state';
import type { ThemeState } from '#api/domain/theme/theme-state';

const EMPTY: ThemeCustomization = {
  templates: {},
  parts: {},
  colors: {},
  styles: {},
};

const AREAS = { header: 'header', footer: 'footer' } as const;

/** Template parts a theme declares or ships, with their area (by slug when undeclared). */
const partsOf = (theme: ThemePackage, custom: ThemeCustomization = EMPTY) => {
  const parts = new Map(
    theme.manifest.templateParts.map((part) => [part.slug, part]),
  );
  for (const slug of new Set([
    ...Object.keys(theme.parts),
    ...Object.keys(custom.parts),
  ]))
    if (!parts.has(slug))
      parts.set(slug, {
        slug,
        title: slug,
        area: AREAS[slug as keyof typeof AREAS] ?? 'uncategorized',
      });
  return [...parts.values()];
};

/** Theme styles with the administrator's changes; unknown font slugs fall back to the theme's. */
const stylesOf = (
  theme: ThemePackage,
  custom: ThemeCustomization,
): ThemeStyles => {
  const fonts = theme.manifest.settings.typography.fontFamilies.map(
    (font) => font.slug,
  );
  const styles = { ...theme.manifest.styles, ...custom.styles };
  if (!fonts.includes(styles.fontFamily))
    styles.fontFamily = theme.manifest.styles.fontFamily;
  if (styles.headingFontFamily && !fonts.includes(styles.headingFontFamily))
    styles.headingFontFamily = '';
  return styles;
};

/** Copies only the fields the public site renders, with site-editor changes applied. */
const toPublic = (
  theme: ThemePackage,
  custom: ThemeCustomization = EMPTY,
): PublicTheme => {
  const { manifest } = theme;
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    settings: {
      palette: manifest.settings.color.palette.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        color: custom.colors[entry.slug] ?? entry.color,
      })),
      fontFamilies: manifest.settings.typography.fontFamilies.map((font) => ({
        slug: font.slug,
        name: font.name,
        fontFamily: font.fontFamily,
      })),
      layout: {
        contentSize: manifest.settings.layout.contentSize,
        wideSize: manifest.settings.layout.wideSize,
      },
    },
    styles: stylesOf(theme, custom),
    templates: { ...theme.templates, ...custom.templates },
    parts: partsOf(theme, custom).map((part) => ({
      slug: part.slug,
      area: part.area,
      blocks: custom.parts[part.slug] ?? theme.parts[part.slug] ?? [],
    })),
    css: theme.css,
    preview: false,
  };
};

const isCustomized = (custom: ThemeCustomization | undefined) =>
  !!custom &&
  (Object.keys(custom.templates).length > 0 ||
    Object.keys(custom.parts).length > 0 ||
    Object.keys(custom.colors).length > 0 ||
    Object.keys(custom.styles).length > 0);

const toAdmin = (
  state: ThemeState,
  theme: ThemePackage,
  screenshots: Record<string, string> = {},
): AdminTheme => ({
  id: theme.manifest.id,
  name: theme.manifest.name,
  version: theme.manifest.version,
  description: theme.manifest.description,
  author: theme.manifest.author,
  palette: toPublic(theme, state.customizations[theme.manifest.id]).settings
    .palette,
  templateCount: Object.keys(theme.templates).length,
  active: state.active === theme.manifest.id,
  builtin: isBuiltinTheme(theme.manifest.id),
  customized: isCustomized(state.customizations[theme.manifest.id]),
  screenshot: screenshots[theme.manifest.id] ?? null,
});

/**
 * Block theme lifecycle (install or upgrade by id, activate, remove) and the site editor, which
 * stores an administrator's template, part and style changes beside the theme instead of
 * editing it, so resetting restores the theme's own files. Themes change presentation only.
 */
export class ThemeService {
  private readonly state: ThemeStateStore;
  private readonly screenshots: ThemeScreenshots;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    settings: SettingsRepository,
    private readonly archive: ThemeArchive,
    images?: Pick<ImageProcessor, 'dimensions'>,
  ) {
    this.state = new ThemeStateStore(settings);
    this.screenshots = new ThemeScreenshots(settings, images);
  }

  /** A theme's preview image (PNG or WebP), or null. */
  screenshot(id: string) {
    return this.screenshots.get(id);
  }

  /** The active theme; the default built-in when nothing (valid) is configured. */
  async getPublic(): Promise<PublicTheme> {
    const state = await this.state.load();

    return toPublic(
      this.require(state, state.active),
      state.customizations[state.active],
    );
  }

  /** Any installed or built-in theme by id, as the public site would show it. */
  async find(id: string): Promise<PublicTheme | null> {
    const state = await this.state.load();
    const theme = findTheme(state, id);
    return theme ? toPublic(theme, state.customizations[id]) : null;
  }

  /** Built-in themes first, then installed ones in install order. */
  async list(): Promise<AdminTheme[]> {
    const [state, screenshots] = await Promise.all([
      this.state.load(),
      this.screenshots.versions(),
    ]);

    return [...BUILTIN_THEMES, ...state.installed].map((theme) =>
      toAdmin(state, theme, screenshots),
    );
  }

  /** Installs a theme archive, or upgrades the installed theme with the same id, keeping its activation and changes. */
  async install(bytes: Uint8Array): Promise<AdminTheme> {
    const { files, screenshot } = this.archive.read(bytes);
    const theme = parseInput(themePackageSchema, packageFromFiles(files));
    if (screenshot) await this.screenshots.check(screenshot);

    if (isBuiltinTheme(theme.manifest.id))
      throw conflict(Errors.ThemeBuiltinReplace);

    return this.exclusive(async () => {
      const state = await this.state.load();
      const index = state.installed.findIndex(
        (installed) => installed.manifest.id === theme.manifest.id,
      );

      if (index === -1) state.installed.push(theme);
      else state.installed[index] = theme;

      await this.state.save(state);
      // An upgrade without a screenshot drops the old one.
      await this.screenshots.save(theme.manifest.id, screenshot);

      return toAdmin(state, theme, await this.screenshots.versions());
    });
  }

  activate(id: string): Promise<AdminTheme> {
    return this.exclusive(async () => {
      const state = await this.state.load();
      const theme = this.require(state, id);

      state.active = theme.manifest.id;
      await this.state.save(state);

      return toAdmin(state, theme);
    });
  }

  remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      if (isBuiltinTheme(id)) throw conflict(Errors.ThemeBuiltinRemove);

      const state = await this.state.load();

      this.require(state, id);

      if (state.active === id) throw conflict(Errors.ThemeActiveRemove);

      state.installed = state.installed.filter(
        (theme) => theme.manifest.id !== id,
      );
      await this.state.save(state);
      if (state.customizations[id]) {
        delete state.customizations[id];
        await this.state.saveCustomizations(state);
      }
      await this.screenshots.save(id, null);
    });
  }

  /** Templates, parts and styles of a theme as the site editor shows them. */
  async editor(id: string): Promise<ThemeEditor> {
    const state = await this.state.load();
    const theme = this.require(state, id);
    const custom = state.customizations[id] ?? EMPTY;
    const current = toPublic(theme, custom);
    const names = new Set([
      ...Object.keys(theme.templates),
      ...Object.keys(custom.templates),
    ]);

    return {
      id,
      name: theme.manifest.name,
      settings: current.settings,
      styles: {
        theme: theme.manifest.styles,
        current: current.styles,
        colors: { ...custom.colors },
        customized:
          Object.keys(custom.colors).length > 0 ||
          Object.keys(custom.styles).length > 0,
      },
      templates: [...names].sort().map((name) => ({
        name,
        blocks: current.templates[name] ?? [],
        inTheme: name in theme.templates,
        customized: name in custom.templates,
      })),
      parts: partsOf(theme, custom).map((part) => ({
        slug: part.slug,
        title: part.title,
        area: part.area,
        blocks: custom.parts[part.slug] ?? theme.parts[part.slug] ?? [],
        inTheme: part.slug in theme.parts,
        customized: part.slug in custom.parts,
      })),
    };
  }

  /** Saves a template; a new name (such as `category-news`) adds it to the hierarchy. */
  async saveTemplate(id: string, name: string, input: unknown): Promise<void> {
    if (!TEMPLATE_NAME.test(name)) throw notFound(Errors.ThemeTemplateNotFound);
    const { blocks } = parseInput(themeBlocksInputSchema, input);
    return this.customize(id, (custom) => {
      custom.templates[name] = blocks;
    });
  }

  /** Restores the theme's own template, or deletes a template the editor added. */
  resetTemplate(id: string, name: string): Promise<void> {
    return this.customize(id, (custom) => {
      if (!(name in custom.templates))
        throw notFound(Errors.ThemeTemplateNotFound);
      delete custom.templates[name];
    });
  }

  async savePart(id: string, slug: string, input: unknown): Promise<void> {
    const { blocks } = parseInput(themeBlocksInputSchema, input);
    return this.customize(id, (custom) => {
      if (!SLUG.test(slug) || slug.length > 64)
        throw invalidInput(Errors.ThemePartNotFound);
      if (!(slug in custom.parts) && Object.keys(custom.parts).length >= 32)
        throw invalidInput(Errors.ThemePartNotFound);
      custom.parts[slug] = blocks;
    });
  }

  resetPart(id: string, slug: string): Promise<void> {
    return this.customize(id, (custom) => {
      if (!(slug in custom.parts)) throw notFound(Errors.ThemePartNotFound);
      delete custom.parts[slug];
    });
  }

  /** Global styles: palette colors (existing slugs only) and typography. */
  async saveStyles(id: string, input: unknown): Promise<void> {
    const { colors, styles } = parseInput(themeStylesInputSchema, input);
    return this.customize(id, (custom, theme) => {
      const palette = theme.manifest.settings.color.palette;
      const fonts = theme.manifest.settings.typography.fontFamilies.map(
        (font) => font.slug,
      );
      for (const slug of Object.keys(colors))
        if (!palette.some((entry) => entry.slug === slug))
          throw invalidInput(Errors.ThemeColorUnknown(slug));
      for (const font of [styles.fontFamily, styles.headingFontFamily])
        if (font && !fonts.includes(font))
          throw invalidInput(Errors.ThemeFontUnknown);
      // Only differences are kept, so a later theme upgrade still shows through.
      custom.colors = Object.fromEntries(
        Object.entries(colors).filter(
          ([slug, color]) =>
            palette
              .find((entry) => entry.slug === slug)
              ?.color.toLowerCase() !== color.toLowerCase(),
        ),
      );
      custom.styles = Object.fromEntries(
        Object.entries(styles).filter(
          ([key, value]) =>
            theme.manifest.styles[key as keyof ThemeStyles] !== value,
        ),
      );
    });
  }

  resetStyles(id: string): Promise<void> {
    return this.customize(id, (custom) => {
      custom.colors = {};
      custom.styles = {};
    });
  }

  private customize(
    id: string,
    change: (custom: ThemeCustomization, theme: ThemePackage) => void,
  ): Promise<void> {
    return this.exclusive(async () => {
      const state = await this.state.load();
      const theme = this.require(state, id);
      const custom = structuredClone(state.customizations[id] ?? EMPTY);
      change(custom, theme);
      parseInput(publicThemeSchema, toPublic(theme, custom));
      if (isCustomized(custom)) state.customizations[id] = custom;
      else delete state.customizations[id];
      await this.state.saveCustomizations(state);
    });
  }

  private require(state: ThemeState, id: string): ThemePackage {
    const theme = findTheme(state, id);

    if (!theme) throw notFound(Errors.ThemeNotFound);

    return theme;
  }

  /** Lifecycle changes run one at a time, so concurrent admin requests cannot interleave. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
