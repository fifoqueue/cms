import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { testContentService, textDocument } from '#test/support/content';
import {
  ADMIN,
  MemoryContentRepository,
  recordingLogger,
} from '#test/support/memory';

test('slug filters normalize output and cannot bypass reserved or occupied slugs', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  const registrar = hooks.registrar('functions:site', { trusted: true });
  let slug = ' CUSTOM ';

  registrar.filter('content.slug', (value) => ({ ...value, slug }));
  const input = {
    type: 'post',
    title: 'Original',
    document: textDocument('Body'),
  };
  const entry = await service.create(input, ADMIN);

  expect(entry.slug).toBe('custom');
  await expect(service.create(input, ADMIN)).rejects.toThrow();
  slug = 'admin';
  const other = await service.create({ ...input, title: 'Other' }, ADMIN);

  expect(other.slug).toBe('other');
  slug = 'changed';
  expect((await service.update(entry.id, input, ADMIN)).slug).toBe('changed');
});

test('revision filters allow zero and ignore counts outside core bounds', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const repository = new MemoryContentRepository();
  const service = testContentService({ hooks, repository });
  let count = 0;

  hooks
    .registrar('functions:site', { trusted: true })
    .filter('content.revisionsToKeep', (value) => ({ ...value, count }));
  const input = {
    type: 'post',
    title: 'Original',
    document: textDocument('Body'),
  };
  const entry = await service.create(input, ADMIN);

  expect(repository.revisions.rows).toHaveLength(0);
  count = -1;
  await service.update(entry.id, { ...input, title: 'Changed' }, ADMIN);
  expect(repository.revisions.rows).toHaveLength(1);
});
