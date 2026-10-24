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

/**
 * Inline custom properties for the site root: the palette as `--cms-color-<slug>`, its roles
 * mapped onto the interface variables, fonts and layout sizes. Every value was validated by
 * the theme schema (hex colors, font stacks, CSS lengths), so nothing else can be written.
 */
export const themeStyle = ({ settings, styles }: ThemeView): string => {
  const color = (slug: string) =>
    settings.palette.find((entry) => entry.slug === slug)?.color ?? '';
  const font = (slug: string) =>
    settings.fontFamilies.find((entry) => entry.slug === slug)?.fontFamily;
  const body = font(styles.fontFamily) ?? 'system-ui, sans-serif';
  const vars: [string, string][] = [
    ...settings.palette.map((entry): [string, string] => [
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
    // Native controls, scrollbars and `light-dark()` follow the palette's base color.
    ['color-scheme', siteScheme({ settings }) ?? ''],
  ];
  return vars
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
};

/** Theme CSS cannot reach outside the site or into its theme-independent auth screens. */
export const scopedCss = (css: string) =>
  css ? `@scope (.cms-site) to (.cms-auth) {\n${css}\n}` : '';
