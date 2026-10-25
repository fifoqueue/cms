/**
 * Browser push helpers shared by pages and the service worker. Pure: no DOM or worker globals,
 * so both programs type-check and test them.
 */

/**
 * Where pages keep the subscription last registered with the server (`{ endpoint, auth }`, the
 * proof `POST /push/renew` needs), and when it was renewed.
 */
export const PUSH_SUBSCRIPTION_KEY = 'cms_push_subscription';
export const PUSH_RENEWED_KEY = 'cms_push_renewed';
/** The endpoint-only value of earlier versions; it cannot prove possession, so it is dropped. */
export const LEGACY_PUSH_ENDPOINT_KEY = 'cms_push_endpoint';

/** Same-site web routes that forward subscriptions to the API (the browser never calls it). */
export const PUSH_RENEW_PATH = '/push/renew';
export const COMMENT_PUSH_PATH = '/comments/push';
export const ADMIN_PUSH_PATH = '/admin/push-subscription';

/** Renewals sent from one device at most this often. */
export const RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A VAPID public key (base64url, padding optional) as `applicationServerKey` bytes. */
export const keyBytes = (key: string): Uint8Array<ArrayBuffer> => {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/** Whether a subscription's `applicationServerKey` is the given key. */
export const sameKey = (
  current: ArrayBuffer | null | undefined,
  key: Uint8Array,
) => {
  if (!current || current.byteLength !== key.byteLength) return false;
  const bytes = new Uint8Array(current);
  return bytes.every((byte, index) => byte === key[index]);
};

export interface PushSubscriptionValue {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/** The fields the server stores from `PushSubscription.toJSON()`; `null` when any is missing. */
export const subscriptionValue = (
  value: unknown,
): PushSubscriptionValue | null => {
  if (!value || typeof value !== 'object') return null;
  const { endpoint, keys } = value as Record<string, unknown>;
  if (!isText(endpoint, 2048) || !/^https:\/\//i.test(endpoint)) return null;
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  if (!isText(p256dh, 200) || !isText(auth, 100)) return null;
  return { endpoint, keys: { p256dh, auth } };
};

/** A subscription's identity and auth secret: what proves possession when it is renewed. */
export interface PushProof {
  endpoint: string;
  auth: string;
}

/** The proof of a subscription value. */
export const proofOf = (subscription: PushSubscriptionValue): PushProof => ({
  endpoint: subscription.endpoint,
  auth: subscription.keys.auth,
});

/** A stored proof (JSON); `null` when it is missing or damaged. */
export const storedProof = (value: string | null): PushProof | null => {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { endpoint, auth } = parsed as Record<string, unknown>;
  return isText(endpoint, 2048) && isText(auth, 100)
    ? { endpoint, auth }
    : null;
};

/** A key from `PushSubscription.getKey()` as unpadded base64url, like `toJSON().keys`. */
export const keyText = (key: ArrayBuffer | null | undefined): string | null => {
  if (!key || !key.byteLength) return null;
  let binary = '';
  for (const byte of new Uint8Array(key)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/** The address as an absolute URL when it belongs to `origin`; anything else is `null`. */
export const sameOrigin = (url: string, origin: string): string | null => {
  try {
    const parsed = new URL(url, origin);
    return parsed.origin === origin ? parsed.href : null;
  } catch {
    return null;
  }
};

export interface PushMessage {
  title: string;
  body: string;
  /** Absolute, on the worker's own origin. */
  url: string;
  tag: string;
  /** An optional web address; the worker otherwise shows the site icon. */
  icon: string | null;
}

/**
 * A push payload (`{ title, body, url, tag }`, optionally `icon`) checked for the worker's
 * origin; `null` when it is malformed or its link leads elsewhere.
 */
export const pushMessage = (
  value: unknown,
  origin: string,
): PushMessage | null => {
  if (!value || typeof value !== 'object') return null;
  const { title, body, url, tag, icon } = value as Record<string, unknown>;
  if (!isText(title, 200) || typeof body !== 'string' || body.length > 1000)
    return null;
  if (!isText(url, 2048) || typeof tag !== 'string' || tag.length > 200)
    return null;
  const link = sameOrigin(url, origin);
  if (!link) return null;
  return {
    title,
    body,
    url: link,
    tag,
    icon: typeof icon === 'string' && /^https?:\/\//i.test(icon) ? icon : null,
  };
};

/** Whether another renewal may be sent, given the stored time of the last one. */
export const renewDue = (last: string | null, now: number) => {
  const at = Number(last);
  return (
    !last || !Number.isFinite(at) || now - at >= RENEW_INTERVAL_MS || at > now
  );
};

/**
 * What a page-load re-sync does with this device's subscription. `baseline`: no usable proof is
 * stored (first run, or the endpoint-only key of earlier versions), so the current subscription
 * is remembered as its own proof. `renew`: at most once a day, the server is told about the
 * current subscription, proven by the stored one — the same subscription when nothing changed,
 * which keeps its registrations' `last_seen_at` fresh (unrenewed ones go stale after 120 days).
 */
export const resyncPlan = (
  stored: PushProof | null,
  current: PushSubscriptionValue,
  lastRenewed: string | null,
  now: number,
): {
  baseline: boolean;
  renew: { old: PushProof; subscription: PushSubscriptionValue } | null;
} => ({
  baseline: !stored,
  renew: renewDue(lastRenewed, now)
    ? { old: stored ?? proofOf(current), subscription: current }
    : null,
});
