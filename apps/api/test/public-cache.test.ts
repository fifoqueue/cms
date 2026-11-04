import { expect, test } from 'bun:test';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { MemoryPublicCache } from '#api/infra/public-cache';
import { invalidatingStore } from '#api/infra/invalidating-store';

test('slow fills stay shared and the full TTL starts after they settle', async () => {
  let now = 0;
  let loads = 0;
  const pending = Promise.withResolvers<string>();
  const cache = new MemoryPublicCache(5_000, () => now);
  const load = () => {
    loads++;

    return loads === 1 ? pending.promise : Promise.resolve('refreshed');
  };
  const first = cache.get('registration', load);

  now = 20_000;

  const second = cache.get('registration', load);

  expect(loads).toBe(1);
  pending.resolve('settled');
  expect(await Promise.all([first, second])).toEqual(['settled', 'settled']);
  now = 24_999;
  expect(await cache.get('registration', load)).toBe('settled');
  expect(loads).toBe(1);
  now = 25_000;
  expect(await cache.get('registration', load)).toBe('refreshed');
  expect(loads).toBe(2);
});

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
