import { expect, test } from 'bun:test';
import { ContentTypeService } from '#api/domain/content/content-types';
import { FieldService } from '#api/domain/content/fields';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { DEFAULT_PERMALINK_SETTINGS } from '@cms/sdk';
import { PermalinkService } from '#api/domain/permalinks/permalink-service';
import { MemoryPermalinkRepository } from '#test/support/memory-permalinks';
import { ADMIN, MemorySettings, recordingLogger } from '#test/support/memory';

test('definition hooks publish committed values and ignore invalid input filters', async () => {
  const settings = new MemorySettings();
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const types = new ContentTypeService(settings, async () => false, hooks);
  const fields = new FieldService({
    settings,
    hooks,
    images: async () => new Map(),
  });
  const registrar = hooks.registrar('definitions');
  const events: unknown[] = [];
  for (const name of [
    'contentType.created',
    'contentType.updated',
    'contentType.deleted',
    'field.created',
    'field.updated',
    'field.deleted',
  ] as const)
    registrar.on(name, (value) => {
      events.push([name, value]);
    });
  registrar.filter('contentType.beforeSave', (value) => ({
    ...value,
    name: '',
  }));
  registrar.filter('field.beforeSave', (value) => ({ ...value, label: '' }));
  const created = await types.create(
    { key: 'book', name: 'Book', pluralName: 'Books' },
    ADMIN,
  );
  const updated = await types.update(
    'book',
    { ...created, name: 'Novel' },
    ADMIN,
  );
  await types.remove('book', ADMIN);
  const field = await fields.create(
    { key: 'rating', label: 'Rating', type: 'number', contentTypes: ['post'] },
    ADMIN,
  );
  const changed = await fields.update(
    'rating',
    { ...field, label: 'Score' },
    ADMIN,
  );
  await fields.remove('rating', ADMIN);
  expect(created.name).toBe('Book');
  expect(field.label).toBe('Rating');
  expect(events).toEqual([
    ['contentType.created', created],
    ['contentType.updated', updated],
    ['contentType.deleted', updated],
    ['field.created', field],
    ['field.updated', changed],
    ['field.deleted', changed],
  ]);
});

test('permalink update announces the committed settings', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const repository = new MemoryPermalinkRepository(() => []);
  const service = new PermalinkService(repository, hooks);
  const events: unknown[] = [];
  hooks.registrar('observer').on('permalinks.updated', (settings) => {
    events.push(settings);
  });
  const result = await service.update(DEFAULT_PERMALINK_SETTINGS);
  expect(events).toEqual([result]);
  expect(await repository.readSettings()).toEqual(result);
});
