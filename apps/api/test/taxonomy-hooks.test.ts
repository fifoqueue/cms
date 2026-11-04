import { expect, test } from 'bun:test';
import { fieldDefinitionSchema } from '@cms/sdk';
import { DefinitionRegistry } from '#api/domain/content/definition-registry';
import { FieldService } from '#api/domain/content/fields';
import {
  PublicTaxonomyService,
  TaxonomyService,
} from '#api/domain/taxonomy/taxonomy-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { testContentService, textDocument } from '#test/support/content';
import {
  ADMIN,
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';

const setup = () => {
  const content = new MemoryContentRepository();
  const repository = new MemoryTaxonomyRepository(content);
  const hooks = new HookBus({
    timeoutMs: 200,
    logger: recordingLogger().logger,
  });
  const settings = new MemorySettings();
  const registry = new DefinitionRegistry(fieldDefinitionSchema);
  const fields = new FieldService({
    settings,
    registry,
    images: async () => new Map(),
  });
  const ids = sequentialIds();
  const admin = new TaxonomyService({
    content,
    hooks,
    fields,
    repository,
    ids,
    clock: fixedClock(),
  });
  const visitor = new PublicTaxonomyService(
    repository,
    undefined,
    hooks,
    fields,
  );
  const entries = testContentService({ repository: content, hooks, ids });
  return { admin, visitor, entries, hooks, settings, registry, repository };
};

const names = (terms: readonly { name: string }[]) =>
  terms.map((term) => term.name);

test('term.query narrows, orders and retargets admin and public lists; invalid results are ignored', async () => {
  const { admin, visitor, entries, hooks } = setup();
  const news = await admin.create('category', { name: 'News' });
  const local = await admin.create('category', {
    name: 'Local',
    parentId: news.id,
  });
  const sports = await admin.create('category', { name: 'Sports' });
  await admin.create('tag', { name: 'Tagged' });
  await entries.create(
    {
      type: 'post',
      title: 'Published',
      status: 'published',
      document: textDocument('Body'),
      categoryIds: [local.id],
    },
    ADMIN,
  );
  await entries.create(
    {
      type: 'post',
      title: 'Draft',
      status: 'draft',
      document: textDocument('Body'),
      categoryIds: [sports.id],
    },
    ADMIN,
  );

  // Without handlers: every term, empty ones included, by name.
  expect(names(await admin.list('category'))).toEqual([
    'Local',
    'News',
    'Sports',
  ]);

  const scopes: string[] = [];
  let next: Record<string, unknown> = {};
  const plugin = hooks.registrar('plugin-a');
  plugin.filter('term.query', (query, context) => {
    scopes.push(context.scope);
    return { ...query, ...next } as typeof query;
  });

  next = { search: 'O', orderBy: 'count', order: 'desc' };
  expect(names(await admin.list('category'))).toEqual(['Sports', 'Local']);
  next = { hideEmpty: true };
  expect(names(await admin.list('category'))).toEqual(['Local', 'Sports']);
  expect(names(await visitor.list('category'))).toEqual(['Local']);
  next = { parentId: news.id };
  expect(names(await visitor.list('category'))).toEqual(['Local']);
  next = { parentId: null, orderBy: 'slug', order: 'desc' };
  expect(names(await admin.list('category'))).toEqual(['Sports', 'News']);
  next = { taxonomy: 'tag' };
  expect(names(await visitor.list('category'))).toEqual(['Tagged']);
  expect(scopes).toEqual([
    'admin',
    'admin',
    'public',
    'public',
    'admin',
    'public',
  ]);

  // Unknown taxonomies and out-of-schema arguments keep the previous value.
  for (const invalid of [
    { taxonomy: 'missing' },
    { orderBy: 'random' },
    { hideEmpty: 'yes' },
  ]) {
    next = invalid;
    expect(names(await admin.list('category'))).toEqual([
      'Local',
      'News',
      'Sports',
    ]);
  }
});

test('term.deleteAllowed is bidirectional and sees the term', async () => {
  const { admin, hooks } = setup();
  const term = await admin.create('category', { name: 'Keep' });
  const seen: string[] = [];
  const refuse = hooks
    .registrar('functions:site', { trusted: true })
    .filter('term.deleteAllowed', (allowed, { term }) => {
      seen.push(`${term.id}:${allowed}`);
      return false;
    });

  await expect(admin.remove('category', term.id)).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect(names(await admin.list('category'))).toEqual(['Keep']);

  hooks.registrar('plugin-b').filter('term.deleteAllowed', () => true, 20);
  await admin.remove('category', term.id);
  expect(await admin.list('category')).toEqual([]);
  expect(seen).toEqual([`${term.id}:true`, `${term.id}:true`]);
  refuse();
});

test('term fields validate on save, serve by audience and survive an unregistered plugin', async () => {
  const { admin, visitor, hooks, settings, registry } = setup();
  const color = 'plugin:demo:color';
  const unregister = registry.register('demo', 'color', {
    label: 'Color',
    type: 'text',
    taxonomies: ['category'],
  });
  await settings.set('contentFields', [
    {
      key: 'rank',
      label: 'Rank',
      type: 'number',
      required: true,
      public: false,
      taxonomies: ['category'],
    },
  ]);

  await expect(
    admin.create('category', { name: 'Missing' }),
  ).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [{ path: 'fields.rank' }],
  });
  await expect(
    admin.create('category', { name: 'Wrong', fields: { rank: 'first' } }),
  ).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [{ path: 'fields.rank' }],
  });
  // Tags declare no fields: values are dropped.
  expect(
    (await admin.create('tag', { name: 'Plain', fields: { rank: 1 } })).fields,
  ).toEqual({});

  const term = await admin.create('category', {
    name: 'Blue',
    fields: { [color]: ' blue ', rank: 1, stray: true },
  });
  expect(term.fields).toEqual({ [color]: 'blue', rank: 1 });
  expect((await visitor.getBySlug('category', 'blue')).fields).toEqual({
    [color]: 'blue',
  });

  // Filtered input is validated by the same definitions.
  const invalid = hooks
    .registrar('functions:site', { trusted: true })
    .filter('term.beforeSave', (data) => ({
      ...data,
      fields: { rank: 'last' },
    }));
  await expect(
    admin.update('category', term.id, { name: 'Blue', fields: { rank: 2 } }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  invalid();

  unregister();
  expect(names(await visitor.list('category'))).toEqual(['Blue']);
  expect((await visitor.list('category'))[0]!.fields).toEqual({});
  const updated = await admin.update('category', term.id, {
    name: 'Blue',
    fields: { rank: 2 },
  });
  expect(updated.fields).toEqual({ [color]: 'blue', rank: 2 });
  const kept = await admin.update('category', term.id, { name: 'Navy' });
  expect(kept.fields).toEqual(updated.fields);
});
