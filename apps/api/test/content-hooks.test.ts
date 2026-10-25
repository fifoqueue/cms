import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { testContentService, textDocument } from '#test/support/content';
import { ADMIN, recordingLogger } from '#test/support/memory';

test('scheduled notification carries the committed admin entry', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  const received: unknown[] = [];
  hooks.registrar('observer').on('content.scheduled', (entry) => {
    received.push(entry);
  });
  const entry = await service.create(
    {
      type: 'post',
      title: 'Later',
      document: textDocument('Later'),
      status: 'scheduled',
      publishedAt: '2099-01-01T00:00:00.000Z',
    },
    ADMIN,
  );
  expect(received).toEqual([entry]);
});

test('content.beforeSave never sees or sets the password; trash/restore emit committed entries', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  const seen: unknown[] = [];
  hooks.registrar('observer').filter('content.beforeSave', (data) => {
    seen.push(data);
    return { ...data, password: 'forged' } as typeof data;
  });
  const lifecycle: { trashedAt: string | null }[] = [];
  for (const name of ['content.trashed', 'content.restored'] as const)
    hooks.registrar('observer').on(name, (entry) => {
      lifecycle.push(entry);
    });
  const document = textDocument('Body');
  const locked = await service.create(
    { type: 'post', title: 'Locked', document, password: 'open-sesame' },
    ADMIN,
  );
  const open = await service.create(
    { type: 'post', title: 'Open', document },
    ADMIN,
  );
  expect(JSON.stringify(seen)).not.toContain('open-sesame');
  expect(seen.every((data) => !Object.hasOwn(data as object, 'password'))).toBe(
    true,
  );
  expect([locked.protected, open.protected]).toEqual([true, false]);

  await service.trash(open.id, ADMIN);
  await service.restore(open.id, ADMIN);
  await Bun.sleep(5);
  expect(lifecycle[0]!.trashedAt).not.toBeNull();
  expect(lifecycle[1]!.trashedAt).toBeNull();
});

test('content query accepts validated pagination and discards invalid output', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = testContentService({ hooks });
  hooks.registrar('pagination').filter('content.query', (query) => ({
    ...query,
    pageSize: 1,
  }));
  hooks.registrar('invalid').filter('content.query', (query) => ({
    ...query,
    pageSize: -1,
  }));
  const result = await service.list({}, ADMIN);
  expect(result.pageSize).toBe(1);
});
