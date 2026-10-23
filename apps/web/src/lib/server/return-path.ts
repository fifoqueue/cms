import { canonicalPermalinkPath } from '@cms/sdk';

/** Query parameter carrying the same-site address to open after signing in. */
export const RETURN_PARAM = 'redirect_to';

const BASE = 'http://return.invalid';
const MAX_RETURN_LENGTH = 2000;

/**
 * A same-origin canonical path to open after sign-in, else the Dashboard. Authentication routes
 * and anything that can leave the site (`//host`, `/\\host`, schemes) are refused.
 */
export const returnPath = (
  value: string | null | undefined,
  loginPath = '/login',
): string => {
  if (
    !value ||
    value.length > MAX_RETURN_LENGTH ||
    !value.startsWith('/') ||
    /[\\\s]/.test(value)
  )
    return '/admin';
  const path = value.split(/[?#]/, 1)[0]!;
  if (path !== '/' && canonicalPermalinkPath(path) !== path) return '/admin';
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return '/admin';
  }
  const blocked = [
    loginPath,
    '/admin/logout',
    '/admin/setup',
    '/admin/sso/callback',
    '/admin/forgot-password',
    '/admin/password',
    '/admin/register',
  ].some(
    (route) => url.pathname === route || url.pathname.startsWith(`${route}/`),
  );
  return url.origin === BASE && !blocked
    ? `${url.pathname}${url.search}`
    : '/admin';
};
