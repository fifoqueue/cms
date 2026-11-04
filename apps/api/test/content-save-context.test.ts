import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { testContentService, textDocument } from '#test/support/content';
import { ADMIN, recordingLogger } from '#test/support/memory';

test('save context and update notifications retain the previous entry', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  const contexts: unknown[] = [];
  const previous: string[] = [];
  const transitions: unknown[] = [];
  const registrar = hooks.registrar('functions:site', { trusted: true });
  registrar.filter('content.beforeSave', (data, context) => {
    contexts.push(context);
    return data;
  });
  registrar.on('content.updated', (entry) => {
    previous.push(entry.previous.title);
  });
  registrar.on('content.statusChanged', (entry) => {
    transitions.push(entry.previousStatus);
  });
  const document = textDocument('Body');
  const entry = await service.create(
    { type: 'post', title: 'Before', document },
    ADMIN,
  );
  await service.update(
    entry.id,
    { type: 'post', title: 'After', document, status: 'published' },
    ADMIN,
  );
  expect(contexts[0]).toEqual({
    contentId: null,
    previous: null,
    actorId: ADMIN.id,
  });
  expect(contexts[1]).toMatchObject({
    contentId: entry.id,
    previous: { title: 'Before' },
    actorId: ADMIN.id,
  });
  expect(previous).toEqual(['Before']);
  expect(transitions).toEqual([null, 'draft']);
});

test('trash filters can reverse a refusal and transitions include trash', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  const entry = await service.create(
    { type: 'post', title: 'Entry', document: textDocument('Body') },
    ADMIN,
  );
  const registrar = hooks.registrar('functions:site', { trusted: true });
  registrar.filter('content.trashAllowed', () => false);
  await expect(service.trash(entry.id, ADMIN)).rejects.toThrow();
  registrar.filter('content.trashAllowed', () => true, 20);
  const transitions: unknown[] = [];
  registrar.on('content.statusChanged', (value) => {
    transitions.push(value.previousStatus);
  });
  await service.trash(entry.id, ADMIN);
  expect((await service.get(entry.id, ADMIN)).trashedAt).not.toBeNull();
  await service.restore(entry.id, ADMIN);
  expect(transitions).toEqual(['draft', 'trash']);
});
