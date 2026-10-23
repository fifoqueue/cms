import type { Cookies } from '@sveltejs/kit';
import type { SessionGrant } from '@cms/sdk';

export const SESSION_COOKIE = '__Host-cms_session';
export const LEGACY_SESSION_COOKIE = 'cms_session';

const options = (secure: boolean) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
});

const nameFor = (url: URL) =>
  url.protocol === 'https:' ? SESSION_COOKIE : LEGACY_SESSION_COOKIE;

/** New host-bound cookie first, then the old name during the migration window. */
export const sessionToken = (cookies: Pick<Cookies, 'getAll'>) => {
  const values = cookies.getAll();
  return (
    values.find(({ name }) => name === SESSION_COOKIE)?.value ??
    values.find(({ name }) => name === LEGACY_SESSION_COOKIE)?.value ??
    null
  );
};

export const startSession = (
  cookies: Cookies,
  grant: SessionGrant,
  url: URL,
) => {
  const name = nameFor(url);
  cookies.delete(
    name === SESSION_COOKIE ? LEGACY_SESSION_COOKIE : SESSION_COOKIE,
    options(name !== SESSION_COOKIE),
  );
  cookies.set(name, grant.token, {
    ...options(name === SESSION_COOKIE),
    expires: new Date(grant.expiresAt),
  });
};

/** Moves a valid legacy HTTPS session without forcing an existing user to sign in again. */
export const migrateSession = (cookies: Cookies, token: string, url: URL) => {
  if (
    url.protocol !== 'https:' ||
    cookies.get(SESSION_COOKIE) ||
    cookies.get(LEGACY_SESSION_COOKIE) !== token
  )
    return;
  cookies.set(SESSION_COOKIE, token, options(true));
  cookies.delete(LEGACY_SESSION_COOKIE, options(false));
};

export const endSession = (cookies: Cookies) => {
  cookies.delete(SESSION_COOKIE, options(true));
  cookies.delete(LEGACY_SESSION_COOKIE, options(false));
};
