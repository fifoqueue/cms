import { expect, test } from 'bun:test';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { MemoryPublicCache } from '#api/infra/public-cache';
import { invalidatingStore } from '#api/infra/invalidating-store';

test('a write invalidates the cached public layout', async () => {
  let title = 'Before';
  let reads = 0;
  const publicCache = new MemoryPublicCache();
  const store = invalidatingStore(
    {
      async set(value: string) {
        title = value;
      },
    },
    ['set'],
    publicCache,
  );
  const empty = { getPublic: async () => ({}) };
  const app = await createApiApp({
    logger: { info() {}, warn() {}, error() {} },
    services: {
      publicCache,
      site: {
        getPublic: async () => {
          reads++;
          return { title };
        },
      },
      seo: { getCore: async () => ({}), present: async () => ({}) },
      themes: { getCore: async () => ({}), present: async () => ({}) },
      themePreviews: { resolve: async () => undefined },
      reading: empty,
      menus: { publicLocations: async () => ({}) },
      widgets: empty,
      archivePaths: { get: async () => ({}) },
      privacy: { publicSettings: async () => ({}) },
    } as unknown as ApiServices,
  });
  app.post('/write', async () => {
    await store.set('After');
    return 'ok';
  });
  app.post('/partial', async () => {
    await store.set('Committed');
    return new Response('Later step failed', { status: 500 });
  });
  const layout = async () =>
    (await app.handle(new Request('http://localhost/api/v1/layout'))).json();
  expect((await layout()).site.title).toBe('Before');
  expect((await layout()).site.title).toBe('Before');
  expect(reads).toBe(1);
  await app.handle(new Request('http://localhost/missing', { method: 'POST' }));
  await layout();
  expect(reads).toBe(1);
  await app.handle(new Request('http://localhost/write', { method: 'POST' }));
  expect((await layout()).site.title).toBe('After');
  expect(reads).toBe(2);
  expect(
    (
      await app.handle(
        new Request('http://localhost/partial', { method: 'POST' }),
      )
    ).status,
  ).toBe(500);
  expect((await layout()).site.title).toBe('Committed');
  expect(reads).toBe(3);
});

test('invalidation during a fill cannot publish its stale snapshot', async () => {
  const cache = new MemoryPublicCache();
  let reads = 0;
  const load = async () => {
    reads++;
    if (reads === 1) {
      cache.invalidate();
      return 'stale';
    }
    return 'current';
  };
  expect(await cache.get('layout', load)).toBe('current');
  expect(await cache.get('layout', load)).toBe('current');
  expect(reads).toBe(2);
});
