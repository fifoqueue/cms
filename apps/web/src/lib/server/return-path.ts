/** Query parameter carrying the admin address to open after signing in (wp-admin's `redirect_to`). */
export const RETURN_PARAM = 'redirect_to';

const BASE = 'http://return.invalid';

/**
 * The admin address to open after signing in: a same-origin path under `/admin` (with its query),
 * else the Dashboard. Anything that could leave the site (`//host`, `/\\host`, schemes) is refused.
 */
export const returnPath = (value: string | null | undefined): string => {
  if (!value || !value.startsWith('/') || /[\\\s]/.test(value)) return '/admin';
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return '/admin';
  }
  const admin =
    url.pathname === '/admin' ||
    (url.pathname.startsWith('/admin/') &&
      !url.pathname.startsWith('/admin/login') &&
      !url.pathname.startsWith('/admin/logout'));
  return url.origin === BASE && admin
    ? `${url.pathname}${url.search}`
    : '/admin';
};
