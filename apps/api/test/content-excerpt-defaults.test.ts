import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { PublishedContentReader } from '#api/domain/content/public-content';
import { testContentService, textDocument } from '#test/support/content';
import {
  ADMIN,
  MemoryContentRepository,
  recordingLogger,
} from '#test/support/memory';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';

test('excerpt options regenerate generated summaries, preserve manual text and protect locked bodies', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const repository = new MemoryContentRepository();
  const service = testContentService({ hooks, repository });
  const published = new MemoryPublishedContentRepository(repository);
  const reader = new PublishedContentReader(published, undefined, hooks);
  const input = {
    type: 'post',
    title: 'Entry',
    status: 'published',
    document: textDocument('one two three four five'),
  };
  const generated = await service.create(input, ADMIN);
  const manual = await service.create({ ...input, excerpt: 'Manual' }, ADMIN);
  const locked = await service.create({ ...input, password: 'secret' }, ADMIN);
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.filter('content.excerpt', (value, context) => {
    expect(context).toEqual({ length: 55, more: '…' });

    return { ...value, length: 2, more: ' [more]' };
  });
  registrar.filter('content.excerpt', (value) => ({ ...value, length: -1 }));
  const summaries = await reader.summariesByIds([
    generated.id,
    manual.id,
    locked.id,
  ]);

  expect(summaries.map((item) => item.excerpt)).toEqual([
    'one two [more]',
    'Manual',
    '',
  ]);
  expect(
    (await reader.summaries({ include: [generated.id] })).items[0]!.excerpt,
  ).toBe('one two [more]');
});

test('editor defaults validate the document and keep the selected type', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.filter('content.defaults', (value) => ({
    ...value,
    title: 'Default title',
    document: textDocument('Default body'),
  }));
  registrar.filter('content.defaults', (value) => ({
    ...value,
    document: { type: 'doc' as const, content: [{ type: 'unknown-node' }] },
  }));
  registrar.filter('content.defaults', (value) => ({ ...value, type: 'page' }));
  expect(await service.defaults('post', ADMIN)).toEqual({
    type: 'post',
    title: 'Default title',
    document: textDocument('Default body'),
  });
  await expect(service.defaults('unknown-type', ADMIN)).rejects.toThrow();
});
