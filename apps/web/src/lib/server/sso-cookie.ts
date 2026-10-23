import type { Cookies } from '@sveltejs/kit';
import type { SsoStart } from '@cms/sdk';

const TRANSACTION_COOKIE = '__Host-cms_sso';
const HTTP_TRANSACTION_COOKIE = 'cms_sso';

export const setSsoTransaction = (
  cookies: Cookies,
  start: SsoStart,
  url: URL,
  callbackPath: string,
) => {
  const secure = url.protocol === 'https:';
  cookies.delete(secure ? HTTP_TRANSACTION_COOKIE : TRANSACTION_COOKIE, {
    path: secure ? callbackPath : '/',
    secure: !secure,
  });
  cookies.set(
    secure ? TRANSACTION_COOKIE : HTTP_TRANSACTION_COOKIE,
    start.transaction,
    {
      path: secure ? '/' : callbackPath,
      secure,
      httpOnly: true,
      sameSite: 'lax',
      expires: new Date(start.expiresAt),
    },
  );
};

export const consumeSsoTransaction = (
  cookies: Cookies,
  url: URL,
  callbackPath: string,
) => {
  const secure = url.protocol === 'https:';
  const name = secure ? TRANSACTION_COOKIE : HTTP_TRANSACTION_COOKIE;
  const transaction = cookies.get(name) ?? null;
  cookies.delete(name, { path: secure ? '/' : callbackPath, secure });
  return transaction;
};
