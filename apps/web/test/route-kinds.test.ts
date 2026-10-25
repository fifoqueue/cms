import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { scanDocumentRoutes } from '#lib/server/route-kinds.js';

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
