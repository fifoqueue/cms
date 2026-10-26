import { serialQueue } from '#api/shared/serial-queue';
import {
  TEMPLATE_NAME,
  SLUG,
  publicThemeSchema,
  siteFontsInputSchema,
  themeBlocksInputSchema,
  themePackageSchema,
  themeStylesInputSchema,
} from '@cms/sdk';
import type {
  AdminTheme,
  PublicTheme,
  SiteFont,
  ThemeCustomization,
  ThemeEditor,
  ThemePackage,
  ThemeStyles,
} from '@cms/sdk';
import { conflict, invalidInput, notFound, Errors } from '#api/shared/errors';
import { withParams } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { BUILTIN_THEMES } from '#api/domain/theme/builtin-themes';
import { packageFromFiles } from '#api/domain/theme/theme-archive';
import type { ThemeArchive } from '#api/domain/theme/theme-archive';
import { ThemeScreenshots } from '#api/domain/theme/theme-screenshots';
import {
  fontsInUse,
  SiteFontStore,
  withSiteFonts,
} from '#api/domain/theme/site-fonts';
import type { ImageProcessor } from '#api/domain/media/ports';
import {
  findTheme,
  isBuiltinTheme,
  ThemeStateStore,
} from '#api/domain/theme/theme-state';
import type { ThemeState } from '#api/domain/theme/theme-state';
import type { HookDispatcher } from '#api/domain/ports';
import type {
  ThemeContributionRequest,
  ThemeContribution,
} from '@cms/sdk/plugin';

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

/** Font slugs styles may choose: the theme's families and the site fonts. */
const fontSlugs = (theme: ThemePackage, fonts: SiteFont[]) => [
  ...theme.manifest.settings.typography.fontFamilies.map((font) => font.slug),
  ...fonts.map((font) => font.slug),
];

/** Theme styles with the administrator's changes; unknown font slugs fall back to the theme's. */
const stylesOf = (
  theme: ThemePackage,
  custom: ThemeCustomization,
  siteFonts: SiteFont[],
): ThemeStyles => {
  const fonts = fontSlugs(theme, siteFonts);
  const styles = { ...theme.manifest.styles, ...custom.styles };
  if (!fonts.includes(styles.fontFamily))
    styles.fontFamily = theme.manifest.styles.fontFamily;
  if (styles.headingFontFamily && !fonts.includes(styles.headingFontFamily))
    styles.headingFontFamily = theme.manifest.styles.headingFontFamily;
  return styles;
};

/** Copies only the fields the public site renders, with site-editor changes applied. */
const toPublic = (
  theme: ThemePackage,
  custom: ThemeCustomization = EMPTY,
  siteFonts: SiteFont[] = [],
): PublicTheme => {
  const { manifest } = theme;
  const styles = stylesOf(theme, custom, siteFonts);
  const fontFamilies = withSiteFonts(
    manifest.settings.typography.fontFamilies.map((font) => ({
      slug: font.slug,
      name: font.name,
      fontFamily: font.fontFamily,
    })),
    siteFonts,
  );
  const stack = (slug: string) =>
    fontFamilies.find((font) => font.slug === slug)?.fontFamily ?? '';
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
      alternatePalette: (manifest.settings.color.alternatePalette ?? []).map(
        (entry) => ({ slug: entry.slug, name: entry.name, color: entry.color }),
      ),
      colorScheme: {
        auto: manifest.settings.colorScheme.auto,
        toggle: manifest.settings.colorScheme.toggle,
      },
      fontFamilies,
      layout: {
        contentSize: manifest.settings.layout.contentSize,
        wideSize: manifest.settings.layout.wideSize,
      },
      scrollToTop: manifest.settings.scrollToTop,
    },
    styles,
    templates: { ...theme.templates, ...custom.templates },
    parts: partsOf(theme, custom).map((part) => ({
      slug: part.slug,
      area: part.area,
      blocks: custom.parts[part.slug] ?? theme.parts[part.slug] ?? [],
    })),
    css: theme.css,
    fonts: fontsInUse(siteFonts, [
      stack(styles.fontFamily),
      stack(styles.headingFontFamily),
    ]),
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
  private readonly siteFonts: SiteFontStore;
  private readonly exclusive = serialQueue();

  constructor(
    settings: SettingsRepository,
    private readonly archive: ThemeArchive,
    images?: Pick<ImageProcessor, 'dimensions'>,
    private readonly hooks?: HookDispatcher,
    private readonly contributions?: {
      keys(): string[];
      resolve(
        query: ThemeContributionRequest,
        key: string,
      ): Promise<ThemeContribution | null>;
      resolveEntry(
        query: ThemeContributionRequest,
        key: string,
      ): Promise<{ source: string; value: ThemeContribution } | null>;
    },
  ) {
    this.state = new ThemeStateStore(settings);
    this.screenshots = new ThemeScreenshots(settings, images);
    this.siteFonts = new SiteFontStore(settings);
  }

  /** The site fonts every theme's styles may use. */
  fonts(): Promise<SiteFont[]> {
    return this.siteFonts.load();
  }

  /** Replaces the site fonts; styles that chose a removed font fall back to the theme's. */
  async saveFonts(input: unknown): Promise<SiteFont[]> {
    const { fonts } = parseInput(siteFontsInputSchema, input);
    await this.exclusive(() => this.siteFonts.save(fonts));
    return fonts;
  }

  /** A theme's preview image (PNG or WebP), or null. */
  screenshot(id: string) {
    return this.screenshots.get(id);
  }

  /** The active theme; the default built-in when nothing (valid) is configured. */
  async getPublic(): Promise<PublicTheme> {
    return this.present(await this.getCore());
  }

  async getCore() {
    const [state, fonts] = await Promise.all([
      this.state.load(),
      this.siteFonts.load(),
    ]);

    return {
      theme: toPublic(
        this.require(state, state.active),
        state.customizations[state.active],
        fonts,
      ),
      custom: state.customizations[state.active],
    };
  }

  present(core: Awaited<ReturnType<ThemeService['getCore']>>) {
    return this.contributed(core.theme, core.custom);
  }

  /** Any installed or built-in theme by id, as the public site would show it. */
  async find(id: string): Promise<PublicTheme | null> {
    const [state, fonts] = await Promise.all([
      this.state.load(),
      this.siteFonts.load(),
    ]);
    const theme = findTheme(state, id);
    return theme
      ? this.contributed(
          toPublic(theme, state.customizations[id], fonts),
          state.customizations[id],
        )
      : null;
  }

  private async contributed(
    theme: PublicTheme,
    custom: ThemeCustomization = EMPTY,
    sources?: {
      templates: Record<string, string>;
      parts: Record<string, string>;
    },
  ) {
    const base = { templates: theme.templates, parts: theme.parts };
    for (const key of this.contributions?.keys() ?? []) {
      const entry = await this.contributions!.resolveEntry(
        { themeId: theme.id, base },
        key,
      );
      if (!entry) continue;
      const contribution = entry.value;
      const parts = new Map(theme.parts.map((part) => [part.slug, part]));
      for (const part of contribution.parts)
        if (!parts.has(part.slug)) parts.set(part.slug, part);
      const merged = publicThemeSchema.safeParse({
        ...theme,
        templates: {
          ...contribution.templates,
          ...theme.templates,
          ...custom.templates,
        },
        parts: [...parts.values()],
      });
      if (merged.success) {
        if (sources) {
          for (const name of Object.keys(contribution.templates))
            if (!(name in theme.templates))
              sources.templates[name] = entry.source;
          for (const part of contribution.parts)
            if (!theme.parts.some((existing) => existing.slug === part.slug))
              sources.parts[part.slug] = entry.source;
        }
        theme = merged.data;
      }
    }
    return theme;
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
      // A new id may have belonged to a removed built-in; its stored changes are not this theme's.
      if (index === -1) await this.state.saveCustomizations(state);
      // An upgrade without a screenshot drops the old one.
      await this.screenshots.save(theme.manifest.id, screenshot);

      const dto = toAdmin(state, theme, await this.screenshots.versions());
      void this.hooks?.emit('theme.installed', dto);
      return dto;
    });
  }

  activate(id: string): Promise<AdminTheme> {
    return this.exclusive(async () => {
      const state = await this.state.load();
      const theme = this.require(state, id);

      state.active = theme.manifest.id;
      await this.state.save(state);

      const dto = toAdmin(state, theme);
      void this.hooks?.emit('theme.activated', dto);
      return dto;
    });
  }

  remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      if (isBuiltinTheme(id)) throw conflict(Errors.ThemeBuiltinRemove);

      const state = await this.state.load();

      const dto = toAdmin(state, this.require(state, id));

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
      void this.hooks?.emit('theme.deleted', dto);
    });
  }

  /** Templates, parts and styles of a theme as the site editor shows them. */
  async editor(id: string): Promise<ThemeEditor> {
    const [state, fonts] = await Promise.all([
      this.state.load(),
      this.siteFonts.load(),
    ]);
    const theme = this.require(state, id);
    const custom = state.customizations[id] ?? EMPTY;
    const sources = {
      templates: {} as Record<string, string>,
      parts: {} as Record<string, string>,
    };
    const contributed = await this.contributed(toPublic(theme), EMPTY, sources);
    const current = await this.contributed(
      toPublic(theme, custom, fonts),
      custom,
    );
    const names = new Set([
      ...Object.keys(theme.templates),
      ...Object.keys(custom.templates),
      ...Object.keys(contributed.templates),
    ]);

    return {
      id,
      name: theme.manifest.name,
      settings: current.settings,
      siteFonts: fonts,
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
        source:
          sources.templates[name] ??
          (name in theme.templates ? 'theme' : 'admin'),
        readOnly: !!sources.templates[name] && !(name in custom.templates),
      })),
      parts: current.parts.map((part) => ({
        slug: part.slug,
        title:
          partsOf(theme, custom).find((entry) => entry.slug === part.slug)
            ?.title ?? part.slug,
        area: part.area,
        blocks: part.blocks,
        inTheme: part.slug in theme.parts,
        customized: part.slug in custom.parts,
        source:
          sources.parts[part.slug] ??
          (part.slug in theme.parts ? 'theme' : 'admin'),
        readOnly: !!sources.parts[part.slug] && !(part.slug in custom.parts),
      })),
    };
  }

  /** Saves a template; a new name (such as `category-news`) adds it to the hierarchy. */
  async saveTemplate(id: string, name: string, input: unknown): Promise<void> {
    if (!TEMPLATE_NAME.test(name)) throw notFound(Errors.ThemeTemplateNotFound);
    const { blocks } = parseInput(themeBlocksInputSchema, input);
    return this.customize(id, 'template.updated', (custom) => {
      custom.templates[name] = blocks;
    });
  }

  /** Restores the theme's own template, or deletes a template the editor added. */
  resetTemplate(id: string, name: string): Promise<void> {
    return this.customize(id, 'template.updated', (custom) => {
      if (!(name in custom.templates))
        throw notFound(Errors.ThemeTemplateNotFound);
      delete custom.templates[name];
    });
  }

  async savePart(id: string, slug: string, input: unknown): Promise<void> {
    const { blocks } = parseInput(themeBlocksInputSchema, input);
    return this.customize(id, 'templatePart.updated', (custom) => {
      if (!SLUG.test(slug) || slug.length > 64)
        throw invalidInput(Errors.ThemePartNotFound);
      if (!(slug in custom.parts) && Object.keys(custom.parts).length >= 32)
        throw invalidInput(Errors.ThemePartNotFound);
      custom.parts[slug] = blocks;
    });
  }

  resetPart(id: string, slug: string): Promise<void> {
    return this.customize(id, 'templatePart.updated', (custom) => {
      if (!(slug in custom.parts)) throw notFound(Errors.ThemePartNotFound);
      delete custom.parts[slug];
    });
  }

  /** Global styles: palette colors (existing slugs only) and typography. */
  async saveStyles(id: string, input: unknown): Promise<void> {
    const { colors, styles } = parseInput(themeStylesInputSchema, input);
    const siteFonts = await this.siteFonts.load();
    return this.customize(id, 'styles.updated', (custom, theme) => {
      const palette = theme.manifest.settings.color.palette;
      const fonts = fontSlugs(theme, siteFonts);
      for (const slug of Object.keys(colors))
        if (!palette.some((entry) => entry.slug === slug))
          throw invalidInput(
            Errors.ThemeColorUnknown,
            withParams(Errors.ThemeColorUnknown, { slug }),
          );
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
    return this.customize(id, 'styles.updated', (custom) => {
      custom.colors = {};
      custom.styles = {};
    });
  }

  private customize(
    id: string,
    event: 'template.updated' | 'templatePart.updated' | 'styles.updated',
    change: (custom: ThemeCustomization, theme: ThemePackage) => void,
  ): Promise<void> {
    return this.exclusive(async () => {
      const state = await this.state.load();
      const theme = this.require(state, id);
      const previous = state.customizations[id] ?? EMPTY;
      const custom = structuredClone(previous);
      change(custom, theme);
      parseInput(
        publicThemeSchema,
        toPublic(theme, custom, await this.siteFonts.load()),
      );
      if (isCustomized(custom)) state.customizations[id] = custom;
      else delete state.customizations[id];
      await this.state.saveCustomizations(state);
      const payload = { themeId: id, customization: custom };
      void this.hooks?.emit(event, payload);
    });
  }

  private require(state: ThemeState, id: string): ThemePackage {
    const theme = findTheme(state, id);

    if (!theme) throw notFound(Errors.ThemeNotFound);

    return theme;
  }
}
