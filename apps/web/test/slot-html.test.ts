import { expect, test } from 'bun:test';
import { sanitizeSlot } from '#lib/server/slot-html.js';
import { webHeadSchema } from '@cms/sdk/functions';

test('slots preserve inert markup while removing executable and policy-changing markup', () => {
  expect(
    sanitizeSlot(
      '<p onclick="alert(1)">Hello <strong>world</strong><script>alert(1)</script><a href="javascript:alert(1)">link</a></p>',
      'body.open',
    ),
  ).toBe('<p>Hello <strong>world</strong><a>link</a></p>');
  expect(
    sanitizeSlot(
      '<meta http-equiv="refresh" content="0;url=https://evil.test"><link rel="stylesheet" href="https://evil.test/a.css"><meta name="description" content="safe">',
      'head',
    ),
  ).toBe('<meta name="description" content="safe">');
  expect(
    sanitizeSlot(
      '<svg><a onload="alert(1)">bad</a></svg><img src="javascript:alert(1)" onerror="alert(1)" alt="ok">',
      'body.close',
    ),
  ).toBe('<img alt="ok">');
});

test('head metadata allows information without changing referrers, indexing or policy', () => {
  const unsafe =
    '<meta name="referrer" content="unsafe-url"><meta name="robots" content="all"><meta name="CSP" content="*"><meta name="refresh" content="0"><meta name="description" http-equiv="refresh" content="0"><base href="https://evil.test/">';
  const safe =
    '<meta name="description" content="About"><meta property="og:title" content="Title"><meta name="twitter:card" content="summary"><meta name="theme-color" content="#ffffff">';

  expect(sanitizeSlot(unsafe + safe, 'head')).toBe(safe);
  expect(
    webHeadSchema.safeParse([
      { tag: 'meta', attrs: { name: 'referrer', content: 'unsafe-url' } },
    ]).success,
  ).toBe(false);
  expect(
    sanitizeSlot(
      '<meta name="referrer" property="og:title" content="unsafe-url">',
      'head',
    ),
  ).toBe('');
});
