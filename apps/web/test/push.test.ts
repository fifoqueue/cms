import { expect, test } from 'bun:test';
import { pushMessage } from '#lib/push.js';

const origin = 'https://blog.example';

test('push payloads only open pages of the site itself', () => {
  const payload = {
    title: 'New reply',
    body: 'Hello',
    url: '/hello#comment-1',
    tag: 'comment-1',
  };
  expect(pushMessage(payload, origin)).toEqual({
    ...payload,
    url: 'https://blog.example/hello#comment-1',
    icon: null,
  });
  for (const url of [
    'https://evil.example/hello',
    '//evil.example/hello',
    'javascript:alert(1)',
    'http://blog.example/hello',
  ])
    expect(pushMessage({ ...payload, url }, origin)).toBeNull();
  expect(pushMessage({ ...payload, title: '' }, origin)).toBeNull();
  expect(pushMessage({ ...payload, body: 1 }, origin)).toBeNull();
  expect(pushMessage('text', origin)).toBeNull();
  expect(pushMessage(null, origin)).toBeNull();
  expect(
    pushMessage({ ...payload, icon: 'javascript:x' }, origin)?.icon,
  ).toBeNull();
});
