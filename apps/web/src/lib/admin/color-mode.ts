/** Admin color mode: an explicit choice, or `system` to follow the device. Browser-safe. */
export const COLOR_MODES = ['light', 'dark', 'system'] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

/** Scoped to /admin so the public site keeps its own theme. */
export const COLOR_MODE_COOKIE = 'cms_admin_theme';

/** Load dependency invalidated when the choice changes. */
export const COLOR_MODE_DEPENDENCY = 'admin:color-mode';

export const colorModeOf = (value: string | undefined): ColorMode =>
  COLOR_MODES.find((mode) => mode === value) ?? 'system';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

const isDark = (mode: ColorMode) =>
  mode === 'dark' || (mode === 'system' && matchMedia(DARK_QUERY).matches);

/** Inline `<head>` script that sets the class before the first paint (no light flash). */
export const colorModeScript = (mode: ColorMode) =>
  `<script>document.documentElement.classList.toggle('dark',${
    mode === 'system' ? `matchMedia('${DARK_QUERY}').matches` : mode === 'dark'
  })</script>`;

/** Applies `mode` to `<html>` and follows device changes; the returned function undoes it. */
export const applyColorMode = (mode: ColorMode) => {
  const root = document.documentElement;
  const query = matchMedia(DARK_QUERY);
  const sync = () => root.classList.toggle('dark', isDark(mode));
  sync();
  query.addEventListener('change', sync);
  return () => {
    query.removeEventListener('change', sync);
    root.classList.remove('dark');
  };
};

/** Remembers the choice for a year. */
export const saveColorMode = (mode: ColorMode) => {
  document.cookie = `${COLOR_MODE_COOKIE}=${mode}; path=/admin; max-age=31536000; samesite=lax`;
};
