import { themeCustomizationSchema, themePackageSchema } from '@cms/sdk';
import type { ThemeCustomization, ThemePackage } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
} from '#api/domain/theme/builtin-themes';

const THEMES_KEY = 'themes';
const CUSTOMIZATIONS_KEY = 'themes.customizations';

/** Which theme is active, which administrator-installed themes exist and their site-editor changes. */
export interface ThemeState {
  /** Always the id of a built-in or installed theme. */
  active: string;
  /** Validated installed themes, never a built-in id, ids unique, in install order. */
  installed: ThemePackage[];
  /** Site-editor changes by theme id; themes without changes have no entry. */
  customizations: Record<string, ThemeCustomization>;
}

export const isBuiltinTheme = (id: string) =>
  BUILTIN_THEMES.some((theme) => theme.manifest.id === id);

/** The built-in or installed theme with `id`, if any. */
export const findTheme = (state: ThemeState, id: string) =>
  BUILTIN_THEMES.find((theme) => theme.manifest.id === id) ??
  state.installed.find((theme) => theme.manifest.id === id);

const recordOf = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Persists theme state as two JSON settings (packages and site-editor changes, so saving a
 * template does not rewrite every package). Whatever is stored is re-validated on read: invalid
 * or unknown entries are dropped and an unresolvable active id falls back to the default
 * built-in, so a damaged setting can never break the site or leak through the API.
 */
export class ThemeStateStore {
  constructor(private readonly settings: SettingsRepository) {}

  async load(): Promise<ThemeState> {
    const [stored, storedCustomizations] = await Promise.all([
      this.settings.get(THEMES_KEY),
      this.settings.get(CUSTOMIZATIONS_KEY),
    ]);
    const record = recordOf(stored);
    const installed: ThemePackage[] = [];

    for (const entry of Array.isArray(record.installed)
      ? (record.installed as unknown[])
      : []) {
      const result = themePackageSchema.safeParse(entry);

      if (
        result.success &&
        !isBuiltinTheme(result.data.manifest.id) &&
        !installed.some(
          (theme) => theme.manifest.id === result.data.manifest.id,
        )
      )
        installed.push(result.data);
    }

    const state: ThemeState = {
      active: DEFAULT_THEME_ID,
      installed,
      customizations: {},
    };

    for (const [id, value] of Object.entries(recordOf(storedCustomizations))) {
      const result = themeCustomizationSchema.safeParse(value);
      if (result.success && findTheme(state, id))
        state.customizations[id] = result.data;
    }

    if (typeof record.active === 'string' && findTheme(state, record.active))
      state.active = record.active;

    return state;
  }

  async save(state: ThemeState): Promise<void> {
    await this.settings.set(THEMES_KEY, {
      active: state.active,
      installed: state.installed,
    });
  }

  async saveCustomizations(state: ThemeState): Promise<void> {
    await this.settings.set(CUSTOMIZATIONS_KEY, state.customizations);
  }
}
