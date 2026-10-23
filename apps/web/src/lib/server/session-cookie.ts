import type { Cookies } from '@sveltejs/kit';
import type { SessionGrant } from '@cms/sdk';

export const SESSION_COOKIE = '__Host-cms_session';
export const LEGACY_SESSION_COOKIE = 'cms_session';

const signedOutName = (url: URL) =>
  url.protocol === 'https:' ? '__Host-cms_signed_out' : 'cms_signed_out';

const options = (secure: boolean) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
});

const nameFor = (url: URL) =>
  url.protocol === 'https:' ? SESSION_COOKIE : LEGACY_SESSION_COOKIE;

/** A completed sign-out authorizes the next login view to clear local editor backups. */
export const markSignedOut = (cookies: Cookies, url: URL) =>
  cookies.set(signedOutName(url), '1', {
    ...options(url.protocol === 'https:'),
    maxAge: 60,
  });

/** HTTPS ignores domain-injected legacy markers; creation and deletion use the same scheme. */
export const takeSignedOut = (cookies: Cookies, url: URL) => {
  const name = signedOutName(url);
  const signedOut = cookies.get(name) === '1';
  if (signedOut) cookies.delete(name, options(url.protocol === 'https:'));
  return signedOut;
};

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
