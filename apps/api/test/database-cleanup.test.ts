import { expect, test } from 'bun:test';
import { DatabaseCleanupService } from '#api/domain/tools/database-cleanup';
import { MemoryDatabaseCleanupStore } from '#test/support/memory-database-cleanup';
import { MemoryTaskLeases } from '#test/support/memory-jobs';
import {
  ADMIN,
  MemoryContentRepository,
  fixedClock,
  sequentialIds,
} from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';

const operator = {
  id: 'operator',
  role: 'custom',
  capabilities: ['tools.manage'] as const,
};
const setup = (store = new MemoryDatabaseCleanupStore()) => {
  const clock = fixedClock();
  const leases = new MemoryTaskLeases(() => clock.now());
  return {
    store,
    leases,
    clock,
    service: new DatabaseCleanupService({
      store,
      leases,
      clock,
      ids: sequentialIds(),
    }),
  };
};

test('cleanup retains newest N revisions per entry and protects recent autosaves', async () => {
  const { service, store, clock } = setup();
  for (const contentId of ['a', 'b'])
    for (let index = 0; index < 205; index++)
      store.rows.revisions.push({
        id: `${contentId}-${index}`,
        contentId,
        createdAt: new Date(index),
      });
  store.rows.autosaves.push(
    { id: 'old', createdAt: new Date(clock.now().getTime() - 8 * 86400000) },
    { id: 'recent', createdAt: clock.now() },
  );
  const preview = await service.preview({ keepLatest: 2 }, operator);
  expect(preview.counts.revisions).toBe(406);
  expect(store.rows.revisions).toHaveLength(410);
  const result = await service.run(
    { categories: ['revisions', 'autosaves'], options: { keepLatest: 2 } },
    operator,
  );
  expect(result.deleted.revisions).toBe(406);
  expect(store.rows.revisions.map((row) => row.id).sort()).toEqual([
    'a-203',
    'a-204',
    'b-203',
    'b-204',
  ]);
  expect(store.rows.autosaves.map((row) => row.id)).toEqual(['recent']);
});

test('cleanup denies unprivileged callers and concurrent runs without deleting anything', async () => {
  const { service, store, leases, clock } = setup();
  store.rows.expired.push({ id: 'dead', createdAt: new Date(0) });
  const reader = { id: 'reader', role: 'subscriber' };
  await expect(service.preview({}, reader)).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(
    service.run({ categories: ['expired'] }, reader),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(leases.rows.size).toBe(0);
  await leases.ensure('tools.database-cleanup');
  await leases.claim('tools.database-cleanup', 'another', 300000, clock.now(), {
    ignoreDue: true,
  });
  await expect(
    service.run({ categories: ['expired'] }, operator),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(store.rows.expired).toHaveLength(1);
});

test('trash cleanup uses domain deletion and removes paths, but refuses restored content', async () => {
  const repository = new MemoryContentRepository();
  const content = testContentService({ repository });
  const entry = await content.create(
    { type: 'post', title: 'Delete me', document: textDocument('Body') },
    ADMIN,
  );
  await content.trash(entry.id, ADMIN);
  const store = new MemoryDatabaseCleanupStore(async (_category, id, actor) => {
    await content.remove(id, actor, true);
  });
  store.rows.trashedContent.push({ id: entry.id, createdAt: new Date(0) });
  const { service } = setup(store);
  expect(
    (await service.run({ categories: ['trashedContent'] }, operator)).deleted
      .trashedContent,
  ).toBe(1);
  expect(await repository.findById(entry.id)).toBeNull();
  expect(
    [...repository.permalinks.paths.values()].filter(
      (path) => path.contentId === entry.id,
    ),
  ).toEqual([]);
  const live = await content.create(
    { type: 'post', title: 'Keep me', document: textDocument('Body') },
    ADMIN,
  );
  await expect(content.remove(live.id, operator, true)).rejects.toMatchObject({
    code: 'conflict',
  });
  expect(await repository.findById(live.id)).not.toBeNull();
});
