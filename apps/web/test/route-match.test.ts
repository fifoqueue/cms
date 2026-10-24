import { expect, mock, test } from 'bun:test';
import {
  decodePathname,
  routeMatcher,
  routePattern,
} from '#lib/route-match.js';

test('escape sequences decode like Kit: uppercase hex and multi-unit forms', () => {
  const matches = (id: string, path: string) => routePattern(id).test(path);
  expect(matches('/a[x+2E]b', '/a.b')).toBe(true);
  expect(matches('/[u+1F600].txt', '/😀.txt')).toBe(true);
  expect(matches('/[u+d83d-de00].txt', '/😀.txt')).toBe(true);
  expect(matches('/[u+1F600].txt', '/x.txt')).toBe(false);
});

test('encoding follows Kit: %25 stays encoded and literal %/?# match their encoded forms', () => {
  expect(decodePathname('/a%20b/%2525/%C3%A9')).toBe('/a b/%2525/é');
  const isDocument = routeMatcher([
    '/100[x+25]',
    '/a[x+2f]b',
    '/q[x+3f]',
    '/h[x+23]',
  ]);
  expect(isDocument('/100%25')).toBe(true);
  expect(isDocument('/100%')).toBe(false);
  expect(isDocument('/a%2Fb')).toBe(true);
  expect(isDocument('/a%2fb')).toBe(true);
  expect(isDocument('/a/b')).toBe(false);
  expect(isDocument('/q%3F')).toBe(true);
  expect(isDocument('/h%23')).toBe(true);
  expect(routeMatcher(['/caf[x+e9]'])('/caf%C3%A9')).toBe(true);
  expect(routeMatcher(['/feed.xml'])('/%E0%A4%A')).toBe(false);
});

test('paths are matched below the base path only', () => {
  const isDocument = routeMatcher(['/feed.xml', '/']);
  expect(isDocument('/blog/feed.xml', '/blog')).toBe(true);
  expect(isDocument('/blog', '/blog')).toBe(true);
  expect(isDocument('/feed.xml', '/blog')).toBe(false);
  expect(isDocument('/blogfeed.xml', '/blog')).toBe(false);
});

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

test('routeMatcher recognises endpoint-only links and leaves page paths alone', () => {
  const isDocument = routeMatcher([
    '/[slug].md',
    '/comments/feed.xml',
    '/feed.xml',
    '/sitemap.xml',
    '/admin/(app)/tools/privacy/[action]/[id]/download',
  ]);
  for (const path of [
    '/feed.xml',
    '/sitemap.xml',
    '/comments/feed.xml',
    '/some-post.md',
    '/admin/tools/privacy/export/abc/download',
  ])
    expect(isDocument(path)).toBe(true);
  for (const path of ['/', '/some-post', '/blog/feed.xml', '/sitemap'])
    expect(isDocument(path)).toBe(false);
});
