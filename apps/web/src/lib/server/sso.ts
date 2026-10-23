import type { Cookies } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { SsoStart } from '@cms/sdk';
import { createSsoClient } from '@cms/sdk/client';
import { apiUrl } from '#lib/server/api.js';
import {
  consumeSsoTransaction,
  setSsoTransaction,
} from '#lib/server/sso-cookie.js';

/** Only the callback ever reads the cookie; the path includes any configured base path. */
const transactionPath = () => resolve('/admin/(auth)/sso/callback');

export const ssoApi = (fetch: typeof globalThis.fetch, token?: string | null) =>
  createSsoClient({ baseUrl: apiUrl, fetch }, token ?? undefined);

/**
 * Binds the pending sign-in to this browser: the callback is accepted only with this cookie,
 * so a provider response replayed into another browser fails. `lax` survives the provider redirect.
 */
export const rememberSsoTransaction = (
  cookies: Cookies,
  start: SsoStart,
  url: URL,
) => {
  setSsoTransaction(cookies, start, url, transactionPath());
};

/** Returns the pending transaction once and forgets it. */
export const takeSsoTransaction = (cookies: Cookies, url: URL) => {
  return consumeSsoTransaction(cookies, url, transactionPath());
};
