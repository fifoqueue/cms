import { expect, spyOn, test } from 'bun:test';
import {
  PublicContentService,
  PublishedContentReader,
} from '#api/domain/content/public-content';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { testContentService, textDocument } from '#test/support/content';
import {
  ADMIN,
  MemoryContentRepository,
  recordingLogger,
  testFields,
  testLocks,
  testTypes,
} from '#test/support/memory';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';

const setup = () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const repository = new MemoryContentRepository();
  const service = testContentService({ hooks, repository });
  const published = new MemoryPublishedContentRepository(repository);
  const reader = new PublishedContentReader(published, undefined, hooks);
  const publicContent = new PublicContentService(
    reader,
    hooks,
    testLocks(published),
    { expand: async (html) => html },
    testFields(),
    testTypes(),
  );
  return { hooks, repository, service, published, reader, publicContent };
};

const input = {
  type: 'post',
  title: 'Entry',
  status: 'published',
  document: textDocument('one two three four'),
};

test('excerpt regeneration cannot disclose a body protected after summary selection', async () => {
  const { hooks, service, repository, reader } = setup();
  const entry = await service.create(input, ADMIN);
  hooks
    .registrar('functions:site', { trusted: true })
    .filter('content.excerpt', async (value) => {
      await service.update(
        entry.id,
        {
          ...input,
          password: 'locked',
          document: textDocument('SECRET changed body'),
        },
        ADMIN,
      );
      return { ...value, length: 1 };
    });
  const page = await reader.summaries({});
  expect((await repository.findById(entry.id))!.passwordHash).not.toBeNull();
  expect(page.items[0]!.excerpt).toBe('');
});

test('public query identity and changed filters preserve normalized sorting', async () => {
  const { hooks, service, repository, publicContent } = setup();
  const alpha = await service.create({ ...input, title: 'Alpha' }, ADMIN);
  const zulu = await service.create({ ...input, title: 'Zulu' }, ADMIN);
  repository.rows.get(alpha.id)!.updatedAt = new Date('2030-01-02');
  repository.rows.get(zulu.id)!.updatedAt = new Date('2030-01-01');
  const registrar = hooks.registrar('functions:site', { trusted: true });
  registrar.filter('content.publicQuery', (value) => value);
  for (const [orderby, expected] of [
    ['title', ['Alpha', 'Zulu']],
    ['modified', ['Zulu', 'Alpha']],
    ['id', ['Alpha', 'Zulu']],
  ] as const) {
    const page = await publicContent.list({ orderby, order: 'asc' });
    expect(page.items.map((item) => item.title)).toEqual([...expected]);
  }
  registrar.filter('content.publicQuery', (value) => ({
    ...value,
    orderBy: 'title' as const,
    order: 'desc' as const,
  }));
  expect(
    (await publicContent.list({ orderby: 'id', order: 'asc' })).items.map(
      (item) => item.title,
    ),
  ).toEqual(['Zulu', 'Alpha']);
});

test('excerpt regeneration fetches one batch only for changed generated excerpts', async () => {
  const { hooks, service, published, reader } = setup();
  const first = await service.create({ ...input, title: 'First' }, ADMIN);
  const second = await service.create({ ...input, title: 'Second' }, ADMIN);
  await service.create({ ...input, excerpt: 'Manual' }, ADMIN);
  await service.create({ ...input, password: 'locked' }, ADMIN);
  const batches = spyOn(published, 'excerptBodies');
  const singles = spyOn(published, 'byId');
  await reader.summaries({});
  expect(batches).not.toHaveBeenCalled();
  const registrar = hooks.registrar('functions:site', { trusted: true });
  registrar.filter('content.excerpt', (value) => value);
  await reader.summaries({});
  expect(batches).not.toHaveBeenCalled();
  registrar.filter('content.excerpt', (value) => ({ ...value, length: 1 }));
  const page = await reader.summaries({});
  expect(batches).toHaveBeenCalledTimes(1);
  expect(new Set(batches.mock.calls[0]![0])).toEqual(
    new Set([first.id, second.id]),
  );
  expect(singles).not.toHaveBeenCalled();
  expect(
    page.items
      .filter((item) => [first.id, second.id].includes(item.id))
      .map((item) => item.excerpt),
  ).toEqual(['one…', 'one…']);
});

test('generated slugs are checked again only when a filter changes them', async () => {
  const { hooks, service, repository } = setup();
  const queries = spyOn(repository, 'takenSlugs');
  await service.create({ ...input, title: 'First' }, ADMIN);
  expect(queries).toHaveBeenCalledTimes(1);
  queries.mockClear();
  const registrar = hooks.registrar('functions:site', { trusted: true });
  registrar.filter('content.slug', (value) => value);
  await service.create({ ...input, title: 'Second' }, ADMIN);
  expect(queries).toHaveBeenCalledTimes(1);
  queries.mockClear();
  registrar.filter('content.slug', (value) => ({ ...value, slug: 'changed' }));
  expect((await service.create({ ...input, title: 'Third' }, ADMIN)).slug).toBe(
    'changed',
  );
  expect(queries).toHaveBeenCalledTimes(2);
});
