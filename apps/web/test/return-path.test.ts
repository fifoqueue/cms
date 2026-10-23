import { expect, test } from 'bun:test';
import { returnPath } from '#lib/server/return-path.js';

test('returnPath keeps admin paths and refuses anything that leaves the site', () => {
  expect(returnPath('/admin/content/abc?autosave')).toBe(
    '/admin/content/abc?autosave',
  );
  expect(returnPath('/admin')).toBe('/admin');
  for (const value of [
    null,
    '',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example/admin',
    '/\t/evil.example',
    '/admin/../../evil',
    '/administrator',
    '/admin/login?redirect_to=/admin',
    'javascript:alert(1)',
    '/blog',
  ])
    expect(returnPath(value)).toBe('/admin');
});
