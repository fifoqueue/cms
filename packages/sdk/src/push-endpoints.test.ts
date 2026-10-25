import { expect, test } from 'bun:test';
import { isPushEndpoint } from '#sdk/comments';

// Visitors choose push endpoints, so the allowlist is the SSRF boundary.
test('only known push services over plain https:443 are endpoints', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/abc',
    'https://api.push.apple.com/abc',
    'https://fcm.googleapis.com:443/fcm/send/abc',
  ])
    expect([endpoint, isPushEndpoint(endpoint)]).toEqual([endpoint, true]);
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com./x',
    'https://push.services.mozilla.com/x',
    'https://evilpush.services.mozilla.com/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com/x#frag',
    'not a url',
  ])
    expect([endpoint, isPushEndpoint(endpoint)]).toEqual([endpoint, false]);
});
