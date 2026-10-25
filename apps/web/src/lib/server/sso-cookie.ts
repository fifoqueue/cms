import type { Cookies } from '@sveltejs/kit';
import { signInStepSchema } from '@cms/sdk';
import type { SignInStep } from '@cms/sdk';
import { Buffer } from 'node:buffer';
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { frontendSecret } from '#lib/server/frontend-secret.js';

/**
 * The one pending sign-in of a browser, whatever the flow: a sign-in, an emailed-link setup, a
 * second factor enrollment on the account page, or linking a single sign-on account. The API's
 * transaction handle never leaves this httpOnly cookie. HTTPS uses only the host-bound name.
 */
const TRANSACTION_COOKIE = '__Host-cms_sso';
const HTTP_TRANSACTION_COOKIE = 'cms_sso';
/** Where earlier versions scoped the plain-HTTP cookie; cleared so it cannot shadow this one. */
const LEGACY_HTTP_PATH = '/admin/sso/callback';
/** Steps shown in the browser have no expiry of their own; the API's still decides. */
const STEP_LIFETIME_MS = 15 * 60_000;
/** Browsers keep about 4 KB per cookie, name and attributes included. */
const MAX_VALUE_LENGTH = 3800;
/** A real step inflates to a few kilobytes; anything larger is refused unread. */
const MAX_PLAIN_BYTES = 32 * 1024;
const VERSION = 'v3.';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** `link` attaches a single sign-on account on the account page; every other flow is steps. */
export type PendingFlow = 'login' | 'setup' | 'enroll' | 'link';

/** A step the browser shows (and shows again after a refused attempt). */
export type PendingStep = Extract<
  SignInStep,
  { kind: 'fields' | 'webauthn' | 'secondFactor' | 'enroll' }
>;

export interface PendingSignIn {
  transaction: string;
  flow: PendingFlow;
  /** Who started an `enroll` or `link` flow (only they may continue it); null otherwise. */
  user: string | null;
  /** The same-site address to open afterwards; checked again before use. */
  back: string | null;
  /** The step waiting for the browser; null while it is away at a provider. */
  step: PendingStep | null;
  /** The method or factor whose step this is, so core fields get catalog labels. */
  owner?: string | null;
}

const FLOWS: readonly PendingFlow[] = ['login', 'setup', 'enroll', 'link'];
/** Flows that belong to the signed-in user who started them. */
export const PERSONAL_FLOWS: readonly PendingFlow[] = ['enroll', 'link'];

/**
 * Without a paired frontend secret, a key of this process: pending steps then end with a
 * restart, which only means starting over.
 */
const processKey = randomBytes(32);
let derived: { secret: string; key: Buffer } | null = null;

/** The AES-256-GCM key of this cookie alone, derived from the frontend secret. */
const pendingKey = () => {
  const secret = frontendSecret();
  if (!secret) return processKey;
  if (derived?.secret !== secret)
    derived = {
      secret,
      key: Buffer.from(
        hkdfSync('sha256', secret, '', 'cms-web pending sign-in cookie v3', 32),
      ),
    };
  return derived.key;
};

/** Encrypted and authenticated, with the cookie name bound in: steps hold secrets (TOTP). */
const encode = (pending: PendingSignIn, name: string) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', pendingKey(), iv);
  cipher.setAAD(Buffer.from(name));
  const sealed = Buffer.concat([
    cipher.update(
      deflateRawSync(
        JSON.stringify({
          transaction: pending.transaction,
          flow: pending.flow,
          user: pending.user,
          back: pending.back,
          step: pending.step,
          owner: pending.owner ?? null,
        }),
      ),
    ),
    cipher.final(),
  ]);
  return `${VERSION}${Buffer.concat([iv, sealed, cipher.getAuthTag()]).toString('base64url')}`;
};

/** Anything this server did not seal (forged, another key, oversized) is no pending step. */
const decode = (value: string, name: string): PendingSignIn | null => {
  if (!value.startsWith(VERSION) || value.length > MAX_VALUE_LENGTH)
    return null;
  try {
    const bytes = Buffer.from(value.slice(VERSION.length), 'base64url');
    if (bytes.length < IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      pendingKey(),
      bytes.subarray(0, IV_BYTES),
    );
    decipher.setAAD(Buffer.from(name));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    const compressed = Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)),
      decipher.final(),
    ]);
    const stored = JSON.parse(
      inflateRawSync(compressed, {
        maxOutputLength: MAX_PLAIN_BYTES,
      }).toString('utf8'),
    ) as Record<string, unknown>;
    const flow = stored.flow as PendingFlow;
    if (
      typeof stored.transaction !== 'string' ||
      !FLOWS.includes(flow) ||
      (typeof stored.back !== 'string' && stored.back !== null) ||
      (PERSONAL_FLOWS.includes(flow)
        ? typeof stored.user !== 'string'
        : stored.user !== null)
    )
      return null;
    const step = signInStepSchema.safeParse(stored.step);
    return {
      transaction: stored.transaction,
      flow,
      user: stored.user as string | null,
      back: stored.back,
      owner: typeof stored.owner === 'string' ? stored.owner : null,
      step:
        step.success &&
        step.data.kind !== 'session' &&
        step.data.kind !== 'done'
          ? step.data.kind === 'redirect'
            ? null
            : step.data
          : null,
    };
  } catch {
    return null;
  }
};

const nameFor = (url: URL) =>
  url.protocol === 'https:' ? TRANSACTION_COOKIE : HTTP_TRANSACTION_COOKIE;

/**
 * Remembers the pending sign-in, replacing any other. `lax` survives a provider's redirect
 * back. A step too large for a cookie is not kept: the browser then starts over.
 */
export const setPending = (
  cookies: Cookies,
  url: URL,
  pending: PendingSignIn,
  expiresAt?: string,
) => {
  const secure = url.protocol === 'https:';
  cookies.delete(secure ? HTTP_TRANSACTION_COOKIE : TRANSACTION_COOKIE, {
    path: '/',
    secure: !secure,
  });
  if (!secure)
    cookies.delete(HTTP_TRANSACTION_COOKIE, {
      path: LEGACY_HTTP_PATH,
      secure,
    });
  const name = nameFor(url);
  let value = encode(pending, name);
  if (value.length > MAX_VALUE_LENGTH)
    value = encode({ ...pending, step: null }, name);
  cookies.set(name, value, {
    path: '/',
    secure,
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(expiresAt ?? Date.now() + STEP_LIFETIME_MS),
  });
};

/** The pending sign-in, left in place (a refused attempt shows the same step again). */
export const readPending = (cookies: Pick<Cookies, 'get'>, url: URL) => {
  const name = nameFor(url);
  const value = cookies.get(name);
  return value ? decode(value, name) : null;
};

export const clearPending = (cookies: Cookies, url: URL) => {
  const secure = url.protocol === 'https:';
  cookies.delete(nameFor(url), { path: '/', secure });
  if (!secure)
    cookies.delete(HTTP_TRANSACTION_COOKIE, {
      path: LEGACY_HTTP_PATH,
      secure,
    });
};

/** Returns the pending sign-in once and forgets it (provider callbacks). */
export const takePending = (cookies: Cookies, url: URL) => {
  const pending = readPending(cookies, url);
  clearPending(cookies, url);
  return pending;
};
