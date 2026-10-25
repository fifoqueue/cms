import { expect, test } from 'bun:test';
import { MenuTypeRegistry } from '#api/plugin-runtime/menu-type-registry';
import { recordingLogger } from '#test/support/memory';
import { menuItemSchema } from '@cms/sdk';

test('menu pickers are bounded, validated and revoked with their owner', async () => {
  const registry = new MenuTypeRegistry({
    timeoutMs: 20,
    logger: recordingLogger().logger,
  });
  const remove = registry.register(
    'example',
    'objects',
    Object.assign(() => ({ url: '/example', title: 'Example' }), {
      label: 'Examples',
      objects: async (query: { search: string }) => ({
        items: [
          { id: 'one', label: query.search },
          { id: 'two', label: 'Second' },
        ],
        total: 2,
      }),
    }),
  );
  expect(registry.types()).toEqual([
    { key: 'objects', label: 'Examples', source: 'example', searchable: true },
  ]);
  expect(
    (await registry.objects('objects', { search: 'First', pageSize: 1 })).items,
  ).toEqual([{ id: 'one', label: 'First' }]);
  await expect(
    registry.objects('objects', { pageSize: 101 }),
  ).rejects.toBeDefined();
  expect(
    menuItemSchema.parse({
      id: 'one',
      kind: 'term',
      taxonomy: 'genre',
      termId: 'term',
    }).taxonomy,
  ).toBe('genre');
  remove();
  expect(registry.types()).toEqual([]);
  expect(await registry.objects('objects', {})).toEqual({
    items: [],
    total: 0,
  });
});
