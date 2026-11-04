import { expect, test } from 'bun:test';
import { AssetRegistry } from '#api/plugin-runtime/asset-registry';
import type { AssetDefinition } from '@cms/sdk';

test('assets validate URLs and attributes, isolate conditions and release registrations', async () => {
  const registry = new AssetRegistry(20);
  const definition: AssetDefinition = {
    kind: 'script',
    src: 'https://cdn.example.com/main.js',
    placement: 'footer',
    attrs: { defer: true },
  };

  for (const src of [
    'javascript:alert(1)',
    '//evil.test/a',
    '/api/plugins/../admin/a',
    '/api/plugins/x/%2e%2e/a',
  ])
    expect(() =>
      registry.register('p', 'bad', { ...definition, src }),
    ).toThrow();
  expect(() =>
    registry.register('p', 'bad', {
      ...definition,
      attrs: { integrity: '" onload="alert(1)' },
    }),
  ).toThrow();
  const release = registry.register('p', 'main', definition);

  registry.register('p', 'broken', {
    ...definition,
    when: () => {
      throw new Error('failed');
    },
  });
  registry.register('p', 'hidden', { ...definition, when: () => false });
  expect(await registry.resolve({ kind: 'home' })).toEqual([
    { ...definition, key: 'main' },
  ]);
  release();
  expect(await registry.resolve({ kind: 'home' })).toEqual([]);
});
