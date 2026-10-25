import { expect, test } from 'bun:test';
import { linkify } from '#lib/theme/comment-text.js';

test('linkify links only http(s) addresses and leaves sentence punctuation as text', () => {
  expect(
    linkify(
      'See https://example.com/a_(b)?q=1&r=2#top, (http://x.test/path). javascript:alert(1) or ftp://x.test',
    ),
  ).toEqual([
    { text: 'See ' },
    {
      text: 'https://example.com/a_(b)?q=1&r=2#top',
      href: 'https://example.com/a_(b)?q=1&r=2#top',
    },
    { text: ', (' },
    { text: 'http://x.test/path', href: 'http://x.test/path' },
    { text: '). javascript:alert(1) or ftp://x.test' },
  ]);
  expect(linkify('주소는 https://example.com에서 확인!')).toEqual([
    { text: '주소는 ' },
    { text: 'https://example.com', href: 'https://example.com/' },
    { text: '에서 확인!' },
  ]);
  // Glued to another scheme or word, without a host, or markup: plain text.
  for (const text of [
    'javascript:https://example.com',
    'xhttps://example.com',
    'https://.',
    '<b>plain</b>',
  ])
    expect(linkify(text)).toEqual([{ text }]);
  expect(
    linkify('"https://example.com/<script>"').map((part) => part.href),
  ).toEqual([undefined, 'https://example.com/', undefined]);
});
