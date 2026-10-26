import type { PublicFont } from '@cms/sdk';
import type { ThemeView } from '#lib/server/public-view.js';

const SIZE = { small: '15px', medium: '16px', large: '17.5px' } as const;
const LEADING = { tight: '1.5', normal: '1.65', relaxed: '1.8' } as const;
const RADIUS = {
  none: '0',
  small: '0.25rem',
  medium: '0.5rem',
  large: '0.875rem',
} as const;

/** `dark` when a `#rgb`/`#rrggbb(aa)` background has a relative luminance below 0.18. */
const schemeOf = (hex: string) => {
  const digits = hex.slice(1);
  const full = digits.length <= 4 ? digits.replace(/./g, '$&$&') : digits;
  const [r, g, b] = [0, 2, 4].map((at) => {
    const value = Number.parseInt(full.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18 ? 'dark' : 'light';
};

/** The site's color scheme, from its palette's base color; `null` without one. */
export const siteScheme = ({ settings }: Pick<ThemeView, 'settings'>) => {
  const base = settings.palette.find((entry) => entry.slug === 'base')?.color;
  return base ? schemeOf(base) : null;
};

type Palette = ThemeView['settings']['palette'];

/** A palette as `--cms-color-<slug>` with its roles mapped onto the interface variables. */
const paletteVars = (palette: Palette): [string, string][] => {
  const color = (slug: string) =>
    palette.find((entry) => entry.slug === slug)?.color ?? '';
  return [
    ...palette.map((entry): [string, string] => [
      `--cms-color-${entry.slug}`,
      entry.color,
    ]),
    ['--background', color('base')],
    ['--foreground', color('contrast')],
    ['--card', color('surface')],
    ['--card-foreground', color('contrast')],
    ['--popover', color('base')],
    ['--popover-foreground', color('contrast')],
    ['--secondary', color('surface')],
    ['--secondary-foreground', color('contrast')],
    ['--muted', color('surface')],
    ['--muted-foreground', color('muted')],
    ['--accent', color('surface')],
    ['--accent-foreground', color('contrast')],
    ['--primary', color('accent')],
    ['--primary-foreground', color('base')],
    ['--border', color('border')],
    ['--input', color('border')],
    ['--ring', color('accent')],
    // Native controls, scrollbars and `light-dark()` follow the palette's base color.
    ['color-scheme', schemeOf(color('base') || '#ffffff')],
  ];
};

const declarations = (vars: [string, string][], suffix = '') =>
  vars
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}${suffix}`)
    .join('; ');

/** The theme's body font stack (schema-checked); the admin area uses it too. */
export const bodyFont = ({
  settings,
  styles,
}: Pick<ThemeView, 'settings' | 'styles'>): string =>
  settings.fontFamilies.find((entry) => entry.slug === styles.fontFamily)
    ?.fontFamily ?? 'system-ui, sans-serif';

/**
 * Inline custom properties for the site root: the palette (`paletteVars`), fonts and layout
 * sizes. Every value was validated by the theme schema (hex colors, font stacks, CSS lengths),
 * so nothing else can be written.
 */
export const themeStyle = ({
  settings,
  styles,
}: Pick<ThemeView, 'settings' | 'styles'>): string => {
  const font = (slug: string) =>
    settings.fontFamilies.find((entry) => entry.slug === slug)?.fontFamily;
  const body = bodyFont({ settings, styles });
  const vars: [string, string][] = [
    ...paletteVars(settings.palette),
    ['--radius', RADIUS[styles.radius]],
    ['--cms-font', body],
    [
      '--cms-heading-font',
      (styles.headingFontFamily && font(styles.headingFontFamily)) || body,
    ],
    ['--cms-content-size', settings.layout.contentSize],
    ['--cms-wide-size', settings.layout.wideSize],
    ['--cms-font-size', SIZE[styles.fontSize]],
    ['--cms-line-height', LEADING[styles.lineHeight]],
  ];
  return declarations(vars);
};

/** Where the visitor's light/dark choice is remembered. */
export const SCHEME_KEY = 'cms-color-scheme';

/**
 * The root attribute that selects a palette: `alternate` shows `alternatePalette`, `default`
 * the palette; without it the theme's `auto` option follows `prefers-color-scheme`.
 */
export const SCHEME_ATTRIBUTE = 'data-cms-scheme';

/** The color scheme of the alternate palette, or null when the theme has a single scheme. */
export const alternateScheme = ({ settings }: Pick<ThemeView, 'settings'>) => {
  const base = settings.alternatePalette.find(
    (entry) => entry.slug === 'base',
  )?.color;
  return base ? schemeOf(base) : null;
};

/**
 * Head CSS that swaps in the alternate palette: when the visitor chose it, or (with `auto`)
 * while their system prefers its scheme and they have not chosen. `!important` overrides the
 * inline palette on `.cms-site`; the values are schema-checked hex colors.
 */
export const schemeCss = (theme: Pick<ThemeView, 'settings'>) => {
  const scheme = alternateScheme(theme);
  const { colorScheme, alternatePalette } = theme.settings;
  if (!scheme || !(colorScheme.auto || colorScheme.toggle)) return '';
  const vars = declarations(paletteVars(alternatePalette), ' !important');
  const chosen = colorScheme.toggle
    ? `:root[${SCHEME_ATTRIBUTE}='alternate'] .cms-site { ${vars} }`
    : '';
  const system = colorScheme.auto
    ? `@media (prefers-color-scheme: ${scheme}) { :root:not([${SCHEME_ATTRIBUTE}]) .cms-site { ${vars} } }`
    : '';
  return [chosen, system].filter(Boolean).join('\n');
};

/**
 * Head CSS painting the document root and body in the site's base color, so overscroll and
 * anything outside `.cms-site` (which holds the palette) match the page instead of the
 * interface default. Follows the same alternate-palette rules as `schemeCss`; only the site
 * layout includes it, so the admin area keeps its own colors.
 */
export const rootCss = (theme: Pick<ThemeView, 'settings'>) => {
  const base = (palette: Palette) =>
    palette.find((entry) => entry.slug === 'base')?.color;
  const main = base(theme.settings.palette);
  if (!main) return '';
  const rule = (selector: string, color: string, suffix = '') =>
    `${selector} { background-color: ${color}${suffix}; color-scheme: ${schemeOf(color)}${suffix} }`;
  const alternate = base(theme.settings.alternatePalette);
  const { colorScheme } = theme.settings;
  const chosen = `:root[${SCHEME_ATTRIBUTE}='alternate']`;
  const system = `:root:not([${SCHEME_ATTRIBUTE}])`;
  return [
    rule(':root, :root > body', main),
    alternate && colorScheme.toggle
      ? rule(`${chosen}, ${chosen} > body`, alternate, ' !important')
      : '',
    alternate && colorScheme.auto
      ? `@media (prefers-color-scheme: ${schemeOf(alternate)}) { ${rule(`${system}, ${system} > body`, alternate, ' !important')} }`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
};

/**
 * The `SCHEME_ATTRIBUTE` value for a stored choice (`light`/`dark`), or null when the theme
 * offers no toggle or nothing valid is stored — the same rule as `schemeScript`, for client
 * navigation into the site and theme changes, where the head script does not run.
 */
export const rememberedScheme = (
  theme: Pick<ThemeView, 'settings'>,
  stored: string | null,
): 'alternate' | 'default' | null => {
  const scheme = alternateScheme(theme);
  if (!scheme || !theme.settings.colorScheme.toggle) return null;
  if (stored !== 'light' && stored !== 'dark') return null;
  return stored === scheme ? 'alternate' : 'default';
};

/**
 * A blocking head `<script>` element that applies a remembered choice before the first paint, so the page
 * never flashes the other scheme. It only reads `localStorage` and sets `SCHEME_ATTRIBUTE`.
 */
export const schemeScript = (theme: Pick<ThemeView, 'settings'>) => {
  const scheme = alternateScheme(theme);
  if (!scheme || !theme.settings.colorScheme.toggle) return '';
  return `<script>try{var s=localStorage.getItem(${JSON.stringify(SCHEME_KEY)});if(s==='light'||s==='dark')document.documentElement.setAttribute(${JSON.stringify(SCHEME_ATTRIBUTE)},s===${JSON.stringify(scheme)}?'alternate':'default')}catch(e){}</script>`;
};

/**
 * `@font-face` rules for site fonts loaded from font files. Family names and addresses were
 * checked by the font schema (no quotes, brackets, backslashes or spaces), so they are written
 * as they are.
 */
export const fontFaceCss = (fonts: readonly PublicFont[]) =>
  fonts
    .flatMap((font) =>
      font.faces.map((face) => {
        const format = /\.woff2$/i.test(face.src)
          ? 'woff2'
          : /\.woff$/i.test(face.src)
            ? 'woff'
            : /\.otf$/i.test(face.src)
              ? 'opentype'
              : 'truetype';
        return `@font-face { font-family: "${font.family}"; src: url("${face.src}") format("${format}"); font-weight: ${face.weight}; font-style: ${face.style}; font-display: ${face.display}; }`;
      }),
    )
    .join('\n');

/** Theme CSS cannot reach outside the site or into its theme-independent auth screens. */
export const scopedCss = (css: string) =>
  css ? `@scope (.cms-site) to (.cms-auth) {\n${css}\n}` : '';
