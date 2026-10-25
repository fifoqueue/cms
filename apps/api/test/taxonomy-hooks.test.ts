import { expect, test } from 'bun:test';
import {
  PublicTaxonomyService,
  TaxonomyService,
} from '#api/domain/taxonomy/taxonomy-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  MemoryContentRepository,
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';

test('term lifecycle emits committed DTOs and validates input and output filters', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const repository = new MemoryTaxonomyRepository(
    new MemoryContentRepository(),
  );
  const service = new TaxonomyService({
    hooks,
    repository,
    ids: sequentialIds(),
    clock: fixedClock(),
  });
  const publicTerms = new PublicTaxonomyService(repository, undefined, hooks);
  const events: unknown[] = [];
  const registrar = hooks.registrar('test');
  for (const name of ['term.created', 'term.updated', 'term.deleted'] as const)
    registrar.on(name, (term) => {
      events.push([name, term]);
    });
  registrar.filter('term.beforeSave', (term) => ({ ...term, name: '' }));
  const created = await service.create('category', { name: 'First' });
  expect(created.name).toBe('First');
  const updated = await service.update('category', created.id, {
    name: 'Second',
  });
  registrar.filter('term.public', (term) => ({ ...term, count: -1 }));
  expect((await publicTerms.getBySlug('category', updated.slug)).count).toBe(0);
  registrar.filter('term.query', () => ({ taxonomy: '' }));
  expect(await service.list('category')).toEqual([updated]);
  expect((await publicTerms.list('category')).map((term) => term.id)).toEqual([
    updated.id,
  ]);
  await service.remove('category', created.id);
  expect(events).toEqual([
    ['term.created', created],
    ['term.updated', updated],
    ['term.deleted', updated],
  ]);
});
