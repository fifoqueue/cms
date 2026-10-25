import { self } from '$app/service-worker';
import {
  keyText,
  pushMessage,
  PUSH_RENEW_PATH,
  subscriptionValue,
} from '#lib/push.js';

/**
 * Push notifications only. There is deliberately no `fetch` handler and no cache: pages, admin
 * screens and assets load exactly as they would without this worker.
 */

/** `pushsubscriptionchange`, which the WebWorker library does not describe. */
interface SubscriptionChange extends ExtendableEvent {
  readonly oldSubscription?: PushSubscription | null;
  readonly newSubscription?: PushSubscription | null;
}

const origin = self.location.origin;

// A new version takes over push handling at once; it has no pages or caches to migrate.
self.addEventListener('install', () => void self.skipWaiting());

self.addEventListener('push', (event) => {
  let data: unknown = null;
  try {
    data = event.data?.json();
  } catch {
    // Not JSON: nothing to show.
  }
  const message = pushMessage(data, origin);
  if (!message) return;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag || undefined,
      icon: message.icon ?? `${origin}/favicon.ico`,
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const stored =
    data && typeof data === 'object' ? (data as { url?: unknown }).url : null;
  const message =
    typeof stored === 'string'
      ? pushMessage({ title: '-', body: '', url: stored, tag: '' }, origin)
      : null;
  if (!message) return;
  const target = new URL(message.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const open = windows.find((client) => {
        const url = new URL(client.url);
        return url.origin === origin && url.pathname === target.pathname;
      });
      if (!open) {
        await self.clients.openWindow(target.href);
        return;
      }
      const focused = await open.focus();
      if (focused.url !== target.href)
        await focused.navigate(target.href).catch(() => null);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  const change = event as SubscriptionChange;
  const old = change.oldSubscription ?? null;
  // Renewal must prove possession of the old subscription; without its auth secret, skip it
  // (the page re-sync or the next registration refreshes the server).
  const auth = old ? keyText(old.getKey('auth')) : null;
  if (!old || !auth) return;
  change.waitUntil(
    (async () => {
      const key = old.options.applicationServerKey;
      const next =
        change.newSubscription ??
        (key
          ? await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key,
            })
          : null);
      const subscription = next && subscriptionValue(next.toJSON());
      if (!subscription) return;
      await fetch(PUSH_RENEW_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          old: { endpoint: old.endpoint, auth },
          subscription,
        }),
      }).catch(() => null);
    })(),
  );
});
