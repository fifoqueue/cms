import { expect, test } from 'bun:test';
import { safeRedirect } from '@cms/sdk';
import { RedirectRegistry } from '#api/domain/permalinks/redirect-registry';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import { HookBus } from '#api/plugin-runtime/hook-bus';

test('redirects reject open destinations, isolate failures, release and announce real misses', async () => {
  for (const to of [
    '//evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
    'https://evil.test',
    '/%2fevil.test',
    '/%255cevil.test',
  ])
    expect(safeRedirect(to)).toBe(false);
  expect(safeRedirect('https://allowed.test/a', ['https://allowed.test'])).toBe(
    true,
  );
  const registry = new RedirectRegistry(20);
  const hooks = new HookBus({
    timeoutMs: 20,
    logger: { info() {}, warn() {}, error() {} },
  });
  const misses: string[] = [];

  hooks.registrar('test').on('request.notFound', ({ path }) => {
    misses.push(path);
  });
  registry.register('test', 'bad', {
    resolve: () => ({ to: '//evil.test', status: 302 }),
  });
  const release = registry.register('test', 'good', {
    resolve: () => ({ to: '/target', status: 307 }),
  });
  const resolver = new PermalinkResolver(
    { findByPath: async () => null },
    { getById: async () => null },
    registry,
    hooks,
  );

  expect(await resolver.resolve({ path: '/old' })).toEqual({
    content: null,
    redirect: true,
    destination: { to: '/target', status: 307 },
  });
  expect(misses).toEqual([]);
  release();
  await expect(resolver.resolve({ path: '/missing' })).rejects.toThrow();
  expect(misses).toEqual(['/missing']);
});
