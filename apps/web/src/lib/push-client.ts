import {
  keyBytes,
  LEGACY_PUSH_ENDPOINT_KEY,
  proofOf,
  PUSH_RENEWED_KEY,
  PUSH_RENEW_PATH,
  PUSH_SUBSCRIPTION_KEY,
  resyncPlan,
  sameKey,
  storedProof,
  subscriptionValue,
} from '#lib/push.js';
import type { PushSubscriptionValue } from '#lib/push.js';

/**
 * Browser push for pages: the worker is registered here, only once someone allows
 * notifications, so visitors who never do so never get one (Kit's automatic registration is off).
 */

/** Served by Kit from `src/service-worker`; the site has no base path. */
const WORKER = '/service-worker.js';

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * Call synchronously at the start of the click or submit that writes something, so the browser
 * sees a user gesture. Resolves `true` once notifications are allowed; `null` when this browser
 * cannot or will not show them (unsupported, or the person already said no: never asked again).
 */
export const askPush = (): Promise<boolean> | null => {
  if (!pushSupported() || Notification.permission === 'denied') return null;
  if (Notification.permission === 'granted') return Promise.resolve(true);
  return Notification.requestPermission().then(
    (permission) => permission === 'granted',
    () => false,
  );
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the next page load re-checks.
  }
};

/** Remembers the registered subscription's proof (`null` forgets it), dropping the legacy key. */
const remember = (subscription: PushSubscriptionValue | null) => {
  write(LEGACY_PUSH_ENDPOINT_KEY, null);
  write(
    PUSH_SUBSCRIPTION_KEY,
    subscription && JSON.stringify(proofOf(subscription)),
  );
};

/** Sends JSON to a same-site route; `true` when it answered 2xx. */
export const sendJson = (path: string, method: string, body: unknown) =>
  fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(
    (response) => response.ok,
    () => false,
  );

/** This device's subscription for `key`; one made for another key is replaced. */
const subscribe = async (key: string) => {
  await navigator.serviceWorker.register(WORKER, { type: 'module' });
  const worker = await navigator.serviceWorker.ready;
  const bytes = keyBytes(key);
  let current = await worker.pushManager.getSubscription();
  if (current && !sameKey(current.options.applicationServerKey, bytes)) {
    await current.unsubscribe();
    current = null;
  }
  current ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  return subscriptionValue(current.toJSON());
};

/**
 * Once `permission` (from `askPush`) is granted, subscribes with the site's VAPID key and hands
 * the subscription to `register`. Every failure is silent: notifications are optional.
 */
export const enablePush = async (
  permission: Promise<boolean>,
  key: string,
  register: (subscription: PushSubscriptionValue) => Promise<boolean>,
) => {
  try {
    if (!(await permission)) return;
    const subscription = await subscribe(key);
    if (subscription && (await register(subscription))) remember(subscription);
  } catch {
    // Notifications stay off; the action itself already succeeded.
  }
};

/** This device's current subscription, without registering the worker. */
export const currentSubscription = async () => {
  if (!pushSupported()) return null;
  const worker = await navigator.serviceWorker.getRegistration();
  return (await worker?.pushManager.getSubscription()) ?? null;
};

/** Ends this device's subscription after `forget` told the server; `false` if that failed. */
export const disablePush = async (
  forget: (endpoint: string) => Promise<boolean>,
) => {
  const current = await currentSubscription();
  if (!current) return true;
  if (!(await forget(current.endpoint))) return false;
  await current.unsubscribe();
  remember(null);
  return true;
};

/**
 * At most once a day per device, tells the server about this device's subscription, proving
 * possession of the last registered one with its endpoint and auth secret (`resyncPlan`): a
 * replaced subscription moves its registrations, an unchanged one refreshes their `last_seen_at`.
 * A device without a usable proof (first run, or the endpoint-only key of earlier versions)
 * takes the current subscription as the baseline. Runs when the page is idle; does nothing
 * without a subscription.
 */
export const resyncPush = () => {
  if (!pushSupported()) return;
  const run = async () => {
    const current = await currentSubscription();
    if (!current) return;
    const subscription = subscriptionValue(current.toJSON());
    if (!subscription) return;
    const now = Date.now();
    const plan = resyncPlan(
      storedProof(read(PUSH_SUBSCRIPTION_KEY)),
      subscription,
      read(PUSH_RENEWED_KEY),
      now,
    );
    if (plan.baseline) remember(subscription);
    if (!plan.renew) return;
    write(PUSH_RENEWED_KEY, String(now));
    if (await sendJson(PUSH_RENEW_PATH, 'POST', plan.renew))
      remember(subscription);
  };
  const start = () => void run().catch(() => null);
  if ('requestIdleCallback' in window)
    requestIdleCallback(start, { timeout: 10_000 });
  else setTimeout(start, 3000);
};
