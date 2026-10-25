// Regression guard: full-text feeds never read the bodies of protected entries.
import { expect, test } from 'bun:test';
import type { PublicContent } from '@cms/sdk';
import { DEFAULT_ENTRY_SEO, toPublicEntrySeo } from '@cms/sdk';
import { loadBodies } from '#lib/server/seo-discovery.js';

const publicSeo = toPublicEntrySeo(DEFAULT_ENTRY_SEO);
const entry = (overrides: Partial<PublicContent> = {}): PublicContent => ({
  id: 'id-1',
  type: 'post',
  slug: 'hello',
  path: '/2026/01/hello',
  title: 'Hello',
  excerpt: 'Excerpt',
  html: '<p>Body</p>',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  categories: [],
  tags: [],
  seo: publicSeo,
  meta: {},
  ...overrides,
});

test('full-text feeds read a few bodies at a time and never protected ones', async () => {
  let running = 0;
  let peak = 0;
  const read: string[] = [];
  const api = {
    resolvePath: async (path: string) => {
      read.push(path);
      peak = Math.max(peak, ++running);
      await Bun.sleep(1);
      running--;
      return { content: { html: '<p>Body</p>' }, redirect: false };
    },
  } as never;
  const items = Array.from({ length: 20 }, (_, index) =>
    entry({ id: `id-${index}`, path: `/p${index}`, protected: index === 0 }),
  );
  const bodies = await loadBodies(api, items, async () => null);
  expect(peak).toBeLessThanOrEqual(4);
  expect(read).toHaveLength(19);
  expect(read).not.toContain('/p0');
  expect(bodies.has('id-0')).toBe(false);
});
