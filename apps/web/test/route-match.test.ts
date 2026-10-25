import { expect, mock, test } from 'bun:test';
import { routePattern } from '#lib/route-match.js';

test('hrefOptions marks same-origin endpoint links and never throws on malformed hrefs', async () => {
  mock.module('$app/paths', () => ({ resolve: () => '/' }));
  mock.module('$app/state', () => ({
    page: { url: new URL('https://site.test/post') },
  }));
  mock.module('virtual:cms/route-kinds', () => ({
    documents: ['/feed.xml', '/[slug].md'],
  }));
  const { hrefOptions } = await import('#lib/route-link.js');
  const reload = (href: string | null) =>
    hrefOptions(href)['data-sveltekit-reload'];
  expect(reload('/feed.xml')).toBe(true);
  expect(reload('https://site.test/a-post.md')).toBe(true);
  expect(reload('https://other.test/feed.xml')).toBeUndefined();
  expect(reload('/a-post')).toBeUndefined();
  expect(reload(null)).toBeUndefined();
  for (const href of ['http://[', 'https://a b', '/%E0%A4%A', '//[::1'])
    expect(() => reload(href)).not.toThrow();
});

test('routePattern follows SvelteKit segment rules with groups dropped', () => {
  const matches = (id: string, path: string) => routePattern(id).test(path);
  expect(matches('/', '/')).toBe(true);
  expect(matches('/feed.xml', '/feed.xml')).toBe(true);
  expect(matches('/feed.xml', '/feed.xml/')).toBe(true);
  expect(matches('/feed.xml', '/feedxxml')).toBe(false);
  expect(matches('/[slug].md', '/some-post.md')).toBe(true);
  expect(matches('/[slug].md', '/a/b.md')).toBe(false);
  expect(matches('/[slug].md', '/some-post')).toBe(false);
  expect(matches('/media/[...key]', '/media')).toBe(true);
  expect(matches('/media/[...key]', '/media/2024/a.png')).toBe(true);
  expect(matches('/media/[...key]', '/mediax')).toBe(false);
  expect(matches('/date/[year]/[[month]]', '/date/2024')).toBe(true);
  expect(matches('/date/[year]/[[month]]', '/date/2024/05')).toBe(true);
  expect(matches('/date/[year]/[[month]]', '/date/2024/05/1')).toBe(false);
  expect(matches('/items/[id=integer]', '/items/7')).toBe(true);
  expect(matches('/admin/(app)/tools/export', '/admin/tools/export')).toBe(
    true,
  );
  expect(
    matches('/admin/(app)/tools/export', '/admin/(app)/tools/export'),
  ).toBe(false);
  expect(matches('/sitemaps/[kind]/[page].xml', '/sitemaps/post/1.xml')).toBe(
    true,
  );
  expect(matches('/a[x+2e]b', '/a.b')).toBe(true);
  expect(matches('/a[x+2e]b', '/axb')).toBe(false);
});
