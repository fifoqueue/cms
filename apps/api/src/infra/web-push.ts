import { generateRequestDetails, generateVAPIDKeys } from 'web-push-neo';
import type { PushSender } from '#api/domain/comments/notification-ports';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** A P-256 VAPID pair: uncompressed public point and PKCS#8 private key, both base64url. */
export const generateVapidKeys = () => generateVAPIDKeys();

/**
 * RFC 8291/8292 messages built by web-push-neo and sent through `fetch`, which must be the
 * egress guard (public addresses only, DNS pinned). Redirects are never followed: a 3xx comes
 * back as its status, which the caller treats as a permanent failure.
 */
export const createWebPushSender = (fetch: Fetcher): PushSender => ({
  async send(target, payload, vapid, options) {
    const request = await generateRequestDetails(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      payload,
      { vapidDetails: vapid, TTL: options.ttl, urgency: options.urgency },
    );
    const response = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status;
  },
});
