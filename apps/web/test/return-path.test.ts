import { expect, test } from 'bun:test';
import { returnPath } from '#lib/server/return-path.js';

test('returnPath keeps canonical same-site paths and refuses auth loops or external destinations', () => {
  expect(returnPath('/admin/content/abc?autosave')).toBe(
    '/admin/content/abc?autosave',
  );
  expect(returnPath('/blog?ref=login')).toBe('/blog?ref=login');
  for (const value of [
    null,
    '',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example/admin',
    '/\t/evil.example',
    '/admin/../../evil',
    '/admin/login?redirect_to=/admin',
    '/members/sign-in',
    '/post/%2F%2Fevil.example',
    `/${'a'.repeat(2000)}`,
    'javascript:alert(1)',
  ])
    expect(returnPath(value, '/members/sign-in')).toBe('/admin');
});
