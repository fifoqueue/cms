import { expect, test } from 'bun:test';
import { fieldDefinitionSchema, taxonomyDefinitionSchema } from '@cms/sdk';
import { definePlugin } from '@cms/sdk/plugin';
import { DefinitionRegistry } from '#api/domain/content/definition-registry';
import { FieldService } from '#api/domain/content/fields';
import { BUILTIN_TAXONOMIES } from '#api/domain/taxonomy/taxonomy-types';
import { MemorySettings } from '#test/support/memory';
import { createRuntime } from '#test/support/runtime';

test('taxonomy declarations dispose without removing core declarations', () => {
  const registry = new DefinitionRegistry(
    taxonomyDefinitionSchema,
    BUILTIN_TAXONOMIES,
  );
  expect(() => registry.register('catalog', 'bad', { name: '' })).toThrow();
  const remove = registry.register('catalog', 'genre', {
    name: 'Genre',
    hierarchical: false,
  });
  expect(registry.list().map((item) => item.key)).toContain(
    'plugin:catalog:genre',
  );
  remove();
  expect(registry.list()).toEqual([...BUILTIN_TAXONOMIES]);
});

test('inactive plugin fields disappear from output but retain stored values', async () => {
  const registry = new DefinitionRegistry(fieldDefinitionSchema);
  expect(() =>
    registry.register('catalog', 'bad', {
      label: 'Bad',
      type: 'select',
      options: [],
      contentTypes: ['post'],
    }),
  ).toThrow();
  const remove = registry.register('catalog', 'rating', {
    label: 'Rating',
    type: 'number',
    contentTypes: ['post'],
  });
  const service = new FieldService({
    registry,
    settings: new MemorySettings(),
    images: async () => new Map(),
  });
  const values = { 'plugin:catalog:rating': 5 };
  expect(await service.validate('post', values)).toEqual(values);
  expect(await service.present('post', values)).toEqual(values);
  remove();
  expect(await service.list()).toEqual([]);
  expect(await service.validate('post', values)).toEqual(values);
  expect(await service.present('post', values)).toEqual({});
});

test('plugin host disable revokes content types and failed activation cleans registrations', async () => {
  const runtime = createRuntime();
  const plugin = definePlugin({
    manifest: { id: 'catalog', name: 'Catalog', version: '1.0.0' },
    activate({ contentTypes }) {
      contentTypes.register('book', { name: 'Book', pluralName: 'Books' });
    },
  });
  await runtime.host.install(runtime.bundles.register('catalog', plugin));
  await runtime.host.enable('catalog');
  expect(runtime.contentTypes.list().map((type) => type.key)).toContain(
    'plugin:catalog:book',
  );
  await runtime.host.disable('catalog');
  expect(runtime.contentTypes.list().map((type) => type.key)).not.toContain(
    'plugin:catalog:book',
  );
  const broken = definePlugin({
    ...plugin,
    activate(context) {
      context.contentTypes.register('book', {
        name: 'Book',
        pluralName: 'Books',
      });
      throw new Error('activation failed');
    },
  });
  await runtime.host.install(runtime.bundles.register('broken', broken));
  await runtime.host.enable('catalog');
  expect(runtime.contentTypes.list().map((type) => type.key)).not.toContain(
    'plugin:catalog:book',
  );
});
