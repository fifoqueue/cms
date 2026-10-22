import type { Cookies } from '@sveltejs/kit';

/** Holds a signed theme preview token; the API ignores forged or expired ones. */
export const THEME_PREVIEW_COOKIE = 'cms_theme_preview';

/** Reads through `getAll`, which public loads may use without touching session cookies. */
export const themePreviewToken = (cookies: Pick<Cookies, 'getAll'>) =>
  cookies.getAll().find(({ name }) => name === THEME_PREVIEW_COOKIE)?.value;

export const startThemePreview = (cookies: Cookies, token: string) =>
  cookies.set(THEME_PREVIEW_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 60,
  });

export const endThemePreview = (cookies: Cookies) =>
  cookies.delete(THEME_PREVIEW_COOKIE, { path: '/' });
