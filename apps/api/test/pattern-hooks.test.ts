import { expect, test } from 'bun:test';
import { PatternService } from '#api/domain/content/pattern-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemoryJsonSettings } from '#test/support/json-settings';
import {
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { textDocument } from '#test/support/content';
import { tiptapRenderer } from '#api/infra/system';

test('pattern actions follow transaction completion and invalid input filters fall back', async () => {
  const settings = new MemoryJsonSettings();
  const hooks = new HookBus({
    timeoutMs: 20,
    logger: recordingLogger().logger,
  });
  let committed = false;
  const service = new PatternService({
    hooks,
    settings,
    transactions: {
      run: async (_lock, task) => {
        committed = false;
        const result = await task(
          Object.assign(settings, { count: async () => 0 }),
        );
        committed = true;
        return result;
      },
    },
    catalog: { summaries: async () => ({ items: [], total: 0 }) },
    renderer: tiptapRenderer,
    ids: sequentialIds(),
    clock: fixedClock(),
  });
  const events: string[] = [];
  const registrar = hooks.registrar('test');
  for (const event of [
    'pattern.created',
    'pattern.updated',
    'pattern.deleted',
  ] as const)
    registrar.on(event, (dto) => {
      expect(committed).toBe(true);
      expect(dto.title).toBe('Pattern');
      expect(dto.authorId).toBe('admin');
      events.push(event);
    });
  registrar.filter('pattern.beforeSave', (value) => {
    expect(value.title).toBe('Pattern');
    return { ...value, title: '' };
  });
  const input = { title: 'Pattern', document: textDocument('Body') };
  const actor = { id: 'admin', role: 'administrator' };
  const pattern = await service.create(input, actor);
  await service.update(pattern.id, input, actor);
  await service.remove(pattern.id, actor);
  expect(events).toEqual([
    'pattern.created',
    'pattern.updated',
    'pattern.deleted',
  ]);
});
