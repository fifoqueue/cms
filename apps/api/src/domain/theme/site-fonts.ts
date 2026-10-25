import { siteFontSchema, siteFontStack, stackFamilies } from '@cms/sdk';
import type { PublicFont, SiteFont } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';

const FONTS_KEY = 'fonts';

/**
 * The site fonts (Appearance → Editor → Styles), one JSON setting shared by every theme. Entries
 * are re-validated on read; invalid or duplicate ones are dropped, so a damaged setting never
 * reaches a page.
 */
export class SiteFontStore {
  constructor(private readonly settings: SettingsRepository) {}

  async load(): Promise<SiteFont[]> {
    const stored = await this.settings.get(FONTS_KEY);
    const fonts: SiteFont[] = [];
    for (const entry of Array.isArray(stored) ? (stored as unknown[]) : []) {
      const result = siteFontSchema.safeParse(entry);
      if (
        result.success &&
        !fonts.some(
          (font) =>
            font.slug === result.data.slug ||
            font.family.toLowerCase() === result.data.family.toLowerCase(),
        )
      )
        fonts.push(result.data);
    }
    return fonts;
  }

  save(fonts: SiteFont[]): Promise<void> {
    return this.settings.set(FONTS_KEY, fonts);
  }
}

/** Theme font families with the site fonts added; a site font replaces a theme family's slug. */
export const withSiteFonts = <F extends { slug: string }>(
  families: F[],
  fonts: SiteFont[],
) => [
  ...families.filter(
    (family) => !fonts.some((font) => font.slug === family.slug),
  ),
  ...fonts.map((font) => ({
    slug: font.slug,
    name: font.family,
    fontFamily: siteFontStack(font),
  })),
];

/**
 * The site fonts a page must load: those whose family a used font stack names (a theme stack
 * such as `"Nanum Gothic", sans-serif` picks up a site font of that name) or that are chosen.
 */
export const fontsInUse = (
  fonts: SiteFont[],
  stacks: string[],
): PublicFont[] => {
  const named = new Set(stacks.flatMap(stackFamilies));
  return fonts
    .filter((font) => named.has(font.family.toLowerCase()))
    .map((font) => ({
      family: font.family,
      stylesheet: font.stylesheet,
      faces: font.faces.map(({ src, weight, style, display }) => ({
        src,
        weight,
        style,
        display,
      })),
    }));
};
