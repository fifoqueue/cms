import type { ThemePackage } from '@cms/sdk';
import { canvasTheme } from '#api/domain/theme/canvas-theme';
import { journalTheme } from '#api/domain/theme/journal-theme';

/** Ships with the core and is active until an administrator chooses another theme. */
export const DEFAULT_THEME_ID = 'canvas';

/** Themes that always exist. They cannot be replaced or removed. */
export const BUILTIN_THEMES: readonly ThemePackage[] = [
  canvasTheme(DEFAULT_THEME_ID),
  journalTheme(),
];
