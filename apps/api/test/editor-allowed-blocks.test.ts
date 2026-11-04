import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { testContentService, textDocument } from '#test/support/content';
import { ADMIN, recordingLogger } from '#test/support/memory';

test('editor policy shares type and user context with saves without preventing reads', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  const input = {
    type: 'post',
    title: 'Existing',
    document: textDocument('Body'),
  };
  const entry = await service.create(input, ADMIN);
  const registrar = hooks.registrar('functions:site', { trusted: true });

  registrar.filter('editor.allowedBlocks', (value) => {
    expect(value.userId).toBe(ADMIN.id);

    return { ...value, blocks: value.type === 'post' ? [] : value.blocks };
  });
  registrar.filter('editor.allowedBlocks', (value) => ({
    ...value,
    blocks: ['unregistered'],
  }));
  expect((await service.editorConfiguration('post', ADMIN)).blocks).toEqual([]);
  expect((await service.editorConfiguration('page', ADMIN)).blocks).toContain(
    'paragraph',
  );
  expect((await service.get(entry.id, ADMIN)).document).toEqual(input.document);
  await expect(service.update(entry.id, input, ADMIN)).rejects.toThrow(
    'not allowed',
  );
  await expect(
    service.create({ ...input, type: 'page' }, ADMIN),
  ).resolves.toMatchObject({ type: 'page' });
});
