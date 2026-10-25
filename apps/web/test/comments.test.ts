import { expect, test } from 'bun:test';
import { placeReply } from '#lib/theme/comment-reply.js';
import { isExternal, leaveFor, linkify } from '#lib/theme/comment-text.js';

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

test('primary, modified and middle clicks on external links ask first', () => {
  const site = 'https://blog.test';
  const away = 'https://example.com/';
  const gesture = (type: string, button: number, ctrlKey = false) => ({
    type,
    button,
    ctrlKey,
    metaKey: false,
    shiftKey: false,
  });
  expect(leaveFor(gesture('click', 0), away, site)).toEqual({
    href: away,
    newTab: false,
  });
  expect(leaveFor(gesture('click', 0, true), away, site)?.newTab).toBe(true);
  expect(leaveFor(gesture('auxclick', 1), away, site)).toEqual({
    href: away,
    newTab: true,
  });
  // Context menus, the primary button's auxclick and same-site links pass through.
  expect(leaveFor(gesture('auxclick', 2), away, site)).toBeNull();
  expect(leaveFor(gesture('auxclick', 0), away, site)).toBeNull();
  expect(leaveFor(gesture('auxclick', 1), `${site}/a`, site)).toBeNull();
});

test('only links leaving the site origin count as external', () => {
  expect(isExternal('https://example.com/a', 'https://blog.test')).toBe(true);
  expect(isExternal('http://blog.test/a', 'https://blog.test')).toBe(true);
  expect(isExternal('https://blog.test/a?b#c', 'https://blog.test')).toBe(
    false,
  );
});

test('the one reply form follows the chosen comment, a refused reply, then the no-script link', () => {
  const thread = [
    { id: 'a', authorName: 'Ann', open: true },
    { id: 'b', authorName: 'Bo', open: true },
    { id: 'deep', authorName: 'Cy', open: false },
  ];
  const replyable = (comment: (typeof thread)[number]) => comment.open;
  const refused = { id: 'a', name: 'Ann' };
  expect(
    placeReply(thread, replyable, { id: 'b', name: 'Bo' }, refused, 'a'),
  ).toEqual({ target: { id: 'b', name: 'Bo' }, host: 'b' });
  // Cancelling hides the form even when the address or a refusal named a comment.
  expect(placeReply(thread, replyable, null, refused, 'a')).toBeNull();
  expect(placeReply(thread, replyable, undefined, refused, 'b')).toEqual({
    target: refused,
    host: 'a',
  });
  expect(placeReply(thread, replyable, undefined, null, 'b')).toEqual({
    target: { id: 'b', name: 'Bo' },
    host: 'b',
  });
  // A refused reply whose comment is gone keeps its context above the main form.
  expect(
    placeReply(thread, replyable, undefined, { id: 'gone', name: 'X' }, null),
  ).toEqual({ target: { id: 'gone', name: 'X' }, host: null });
  // The link cannot open a reply to a comment off this page or past the depth limit.
  for (const requested of ['gone', 'deep', null])
    expect(
      placeReply(thread, replyable, undefined, null, requested),
    ).toBeNull();
});
