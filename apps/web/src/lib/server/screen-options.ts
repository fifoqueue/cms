import type { Cookies } from '@sveltejs/kit';
import { SCREEN_COOKIE } from '#lib/admin/screen-options.js';

/**
 * The viewer's Screen Options for one list (wp-admin's per-user screen settings). They live in a
 * browser cookie written by `ScreenOptions.svelte`, so the value is untrusted: unknown columns
 * are dropped and the page size is clamped.
 */
export const readScreenOptions = <Column extends string>(
  cookies: Cookies,
  screen: string,
  columns: readonly Column[],
  perPage: number,
) => {
  let stored: { perPage?: unknown; hidden?: unknown } = {};
  try {
    const value = JSON.parse(cookies.get(SCREEN_COOKIE(screen)) ?? '{}');
    if (value && typeof value === 'object') stored = value;
  } catch {
    // A malformed cookie means the defaults.
  }
  const size = Math.trunc(Number(stored.perPage));
  return {
    perPage: size >= 1 && size <= 100 ? size : perPage,
    hidden: Array.isArray(stored.hidden)
      ? columns.filter((column) =>
          (stored.hidden as unknown[]).includes(column),
        )
      : [],
  };
};
