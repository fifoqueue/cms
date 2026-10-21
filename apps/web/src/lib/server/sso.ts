import type { Cookies } from '@sveltejs/kit';
import { CMS_API_URL, OIDC_FRONTEND_SECRET } from '$app/env/private';
import { resolve } from '$app/paths';
import type { SsoStart } from '@cms/sdk';
import { createSsoClient } from '@cms/sdk/client';
import type { SsoClientProof } from '@cms/sdk/client';

const TRANSACTION_COOKIE = 'cms_sso';

/** Only the callback ever reads the cookie; the path includes any configured base path. */
const transactionPath = () => resolve('/admin/(auth)/sso/callback');

export const ssoApi = (fetch: typeof globalThis.fetch, token?: string | null) =>
  createSsoClient({ baseUrl: CMS_API_URL, fetch }, token ?? undefined);

/**
 * Vouches for the visitor's address (`getClientAddress()`, which honours the adapter's proxy
 * settings) so the API limits pending sign-ins per visitor. Without the shared secret the API
 * counts every visitor in one shared quota.
 */
export const ssoClientProof = (address: string): SsoClientProof | undefined =>
  OIDC_FRONTEND_SECRET ? { address, secret: OIDC_FRONTEND_SECRET } : undefined;

/**
 * Binds the pending sign-in to this browser: the callback is accepted only with this cookie,
 * so a provider response replayed into another browser fails. `lax` survives the provider redirect.
 */
export const rememberSsoTransaction = (cookies: Cookies, start: SsoStart) =>
  cookies.set(TRANSACTION_COOKIE, start.transaction, {
    path: transactionPath(),
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(start.expiresAt),
  });

/** Returns the pending transaction once and forgets it. */
export const takeSsoTransaction = (cookies: Cookies) => {
  const transaction = cookies.get(TRANSACTION_COOKIE) ?? null;
  cookies.delete(TRANSACTION_COOKIE, { path: transactionPath() });

  return transaction;
};
