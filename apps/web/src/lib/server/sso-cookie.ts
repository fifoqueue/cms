import type { Cookies } from '@sveltejs/kit';
import type { SsoStart } from '@cms/sdk';
import { Buffer } from 'node:buffer';

const TRANSACTION_COOKIE = '__Host-cms_sso';
const HTTP_TRANSACTION_COOKIE = 'cms_sso';

export interface BrowserSsoTransaction {
  transaction: string;
  back: string | null;
}

const encode = (transaction: string, back?: string) =>
  back
    ? `v1.${Buffer.from(JSON.stringify({ transaction, back })).toString('base64url')}`
    : transaction;

const decode = (value: string): BrowserSsoTransaction => {
  if (value.startsWith('v1.'))
    try {
      const stored = JSON.parse(
        Buffer.from(value.slice(3), 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      if (
        typeof stored.transaction === 'string' &&
        typeof stored.back === 'string'
      )
        return { transaction: stored.transaction, back: stored.back };
    } catch {
      // A legacy opaque handle that happens to use this prefix remains usable.
    }
  return { transaction: value, back: null };
};

export const setSsoTransaction = (
  cookies: Cookies,
  start: SsoStart,
  url: URL,
  callbackPath: string,
  back?: string,
) => {
  const secure = url.protocol === 'https:';
  cookies.delete(secure ? HTTP_TRANSACTION_COOKIE : TRANSACTION_COOKIE, {
    path: secure ? callbackPath : '/',
    secure: !secure,
  });
  cookies.set(
    secure ? TRANSACTION_COOKIE : HTTP_TRANSACTION_COOKIE,
    encode(start.transaction, back),
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
  const transaction = cookies.get(name);
  cookies.delete(name, { path: secure ? '/' : callbackPath, secure });
  return transaction ? decode(transaction) : null;
};
