import { expect, test } from 'bun:test';
import { contentTypeKeySchema, contentTypeInputSchema } from '@cms/sdk';
import { ContentTypeRegistry } from '#api/domain/content/content-type-registry';
import {
  BUILTIN_TYPES,
  ContentTypeService,
} from '#api/domain/content/content-types';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';
import { testContentService, textDocument } from '#test/support/content';
import {
  ADMIN,
  MemorySettings,
  MemoryContentRepository,
} from '#test/support/memory';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { VisibleContentRepository } from '#api/domain/content/visible-content';
import { PublishedContentReader } from '#api/domain/content/public-content';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';

test('type declarations are scoped and disabling preserves stored content', async () => {
  const registry = new ContentTypeRegistry(BUILTIN_TYPES);
  const scope = new PluginScope();
  scope.track(() =>
    registry.register('catalog', 'book', { name: 'Book', pluralName: 'Books' }),
  );
  const types = new ContentTypeService(
    new MemorySettings(),
    async () => false,
    undefined,
    registry,
  );
  const repository = new MemoryContentRepository();
  const content = testContentService({ types, repository });
  const reader = new PublishedContentReader(
    new VisibleContentRepository(
      new MemoryPublishedContentRepository(repository),
      async () => (await types.list()).map((type) => type.key),
    ),
  );
  const paths = new PermalinkResolver(repository.permalinks, {
    getById: (id) => reader.getById(id),
  });
  const entry = await content.create(
    {
      type: 'plugin:catalog:book',
      title: 'A book',
      status: 'published',
      document: textDocument('Preserved'),
    },
    ADMIN,
  );
  expect(await types.get(entry.type)).not.toBeNull();
  expect((await reader.list()).total).toBe(1);
  expect((await paths.resolve({ path: entry.path })).content.id).toBe(entry.id);
  scope.dispose();
  expect(await types.get(entry.type)).toBeNull();
  expect(await content.get(entry.id, ADMIN)).toEqual(entry);
  expect((await content.list({}, ADMIN)).items[0]?.inactiveType).toBe(true);
  expect(await reader.getById(entry.id)).toBeNull();
  expect(await reader.getBySlug(entry.slug)).toBeNull();
  expect((await reader.list()).total).toBe(0);
  expect((await reader.summaries({ type: entry.type })).total).toBe(0);
  expect((await reader.summaries({ search: 'book' })).total).toBe(0);
  await expect(paths.resolve({ path: entry.path })).rejects.toMatchObject({
    code: 'not_found',
  });
  registry.register('catalog', 'book', { name: 'Book', pluralName: 'Books' });
  expect((await reader.list()).total).toBe(1);
  expect((await reader.summaries({ search: 'book' })).total).toBe(1);
  expect((await paths.resolve({ path: entry.path })).content.id).toBe(entry.id);
  expect(await types.get('post')).toEqual(BUILTIN_TYPES[0]!);
});

test('invalid declarations cannot replace builtins and stored keys remain valid', () => {
  const registry = new ContentTypeRegistry(BUILTIN_TYPES);
  expect(() =>
    registry.register('catalog', 'book', { name: '', pluralName: 'Books' }),
  ).toThrow();
  expect(registry.list()).toEqual([...BUILTIN_TYPES]);
  for (const key of ['post', 'custom-type', 'plugin:catalog:book'])
    expect(contentTypeKeySchema.safeParse(key).success).toBe(true);
  expect(
    contentTypeInputSchema.safeParse({
      key: 'plugin:catalog:book',
      name: 'Book',
      pluralName: 'Books',
    }).success,
  ).toBe(false);
});
