import { expect, test } from 'bun:test';
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

const setup = async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const repository = new MemoryContentRepository();
  const service = testContentService({ hooks, repository });
  const published = new MemoryPublishedContentRepository(repository);
  const publicContent = new PublicContentService(
    new PublishedContentReader(published),
    hooks,
    testLocks(published),
    { expand: async (html) => html },
    testFields(),
    testTypes(),
  );
  const create = (title: string, status: 'draft' | 'published') =>
    service.create(
      { type: 'post', title, status, document: textDocument('Body') },
      ADMIN,
    );
  const first = await create('First', 'published');
  const second = await create('Second', 'published');
  const draft = await create('Draft', 'draft');

  return { hooks, publicContent, first, second, draft };
};

test('public query changes non-search selection and invalid changes are ignored', async () => {
  const { hooks, publicContent, first } = await setup();
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.filter('content.publicQuery', (value) => ({
    ...value,
    include: [first.id],
  }));
  registrar.filter('content.publicQuery', (value) => ({
    ...value,
    pageSize: -1,
  }));
  expect((await publicContent.list({})).items.map((item) => item.id)).toEqual([
    first.id,
  ]);
  expect((await publicContent.list({ search: 'Second' })).items).toHaveLength(
    1,
  );
});

test('public results add published ids, reorder, and reject draft additions', async () => {
  const { hooks, publicContent, first, second, draft } = await setup();
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.filter('content.publicResults', () => ({
    ids: [second.id, first.id],
    total: 2,
  }));
  registrar.filter('content.publicResults', () => ({
    ids: [draft.id],
    total: 1,
  }));
  const page = await publicContent.list({ include: [first.id] });

  expect(page.items.map((item) => item.id)).toEqual([second.id, first.id]);
  expect(page.total).toBe(2);
});

test('title filters affect single and summary display, not routing identity', async () => {
  const { hooks, publicContent, first } = await setup();

  hooks
    .registrar('functions:site', { trusted: true })
    .filter('content.title', (value) => ({ ...value, title: 'Display' }));
  expect(await publicContent.getBySlug(first.slug)).toMatchObject({
    title: 'Display',
    slug: first.slug,
  });
  expect(
    (await publicContent.list({})).items.map((item) => item.title),
  ).toEqual(['Display', 'Display']);
});
