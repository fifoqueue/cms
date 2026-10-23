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

/** HTTPS trusts only the host-bound name; HTTP keeps its separate development session. */
export const sessionToken = (cookies: Pick<Cookies, 'get'>, url: URL) =>
  cookies.get(nameFor(url)) ?? null;

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

export const endSession = (cookies: Cookies) => {
  cookies.delete(SESSION_COOKIE, options(true));
  cookies.delete(LEGACY_SESSION_COOKIE, options(false));
};
