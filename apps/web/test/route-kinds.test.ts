import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import {
  documentRoutes,
  routeId,
  scanDocumentRoutes,
} from '#lib/server/route-kinds.js';

test('routeId keeps the directory path verbatim, like SvelteKit', () => {
  expect(routeId('+page.svelte')).toBe('/');
  expect(routeId('feed.xml/+server.ts')).toBe('/feed.xml');
  expect(routeId('(site)/[...path]/+page.svelte')).toBe('/(site)/[...path]');
  expect(routeId('[slug].md/+server.ts')).toBe('/[slug].md');
  expect(routeId('(site)/date/[year]/[[month]]/+page.server.ts')).toBe(
    '/(site)/date/[year]/[[month]]',
  );
  expect(routeId('items/[id=integer]/+server.js')).toBe('/items/[id=integer]');
});

test('documentRoutes lists endpoints without a page and ignores non-route files', () => {
  expect(
    documentRoutes([
      'feed.xml/+server.ts',
      '[slug].md/+server.ts',
      'media/[...key]/+server.ts',
      '(site)/[...path]/+page.svelte',
      '(site)/+layout.svelte',
      'both/+server.ts',
      'both/+page.svelte',
      'server-load/+server.ts',
      'server-load/+page.server.ts',
      'named/+server.ts',
      'named/+page@(site).svelte',
      'tested/+server.test.ts',
      'typed/+server.d.ts',
      'helper/server.ts',
    ]),
  ).toEqual(['/[slug].md', '/feed.xml', '/media/[...key]']);
});

test('scanDocumentRoutes finds the app endpoints that the catch-all page would capture', () => {
  const documents = scanDocumentRoutes(
    fileURLToPath(new URL('../src/routes', import.meta.url)),
  );
  expect(documents).toEqual(
    expect.arrayContaining([
      '/comments/feed.xml',
      '/feed.xml',
      '/sitemap.xml',
      '/[slug].md',
      '/admin/(app)/tools/export',
    ]),
  );
  expect(documents).not.toContain('/(site)/[...path]');
  expect(documents).not.toContain('/(site)/[slug]');
});
