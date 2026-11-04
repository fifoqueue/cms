import { expect, test } from 'bun:test';
import { AdminUiRegistry } from '#api/plugin-runtime/admin-ui-registry';
import { createAdminUiAccess } from '#api/composition/admin-ui';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';

test('contributors cannot run actions or read columns for another authors draft', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const content = testContentService({ hooks });
  const actor = { id: 'contributor', role: 'contributor' };
  const own = await content.create(
    {
      type: 'post',
      title: 'Own',
      document: textDocument('own'),
      status: 'draft',
    },
    actor,
  );
  const other = await content.create(
    {
      type: 'post',
      title: 'Other',
      document: textDocument('private'),
      status: 'draft',
    },
    { id: 'other', role: 'contributor' },
  );
  const unused = async (): Promise<never> => {
    throw new Error('unexpected screen');
  };
  const access = createAdminUiAccess(
    {} as Parameters<typeof createAdminUiAccess>[0],
    content,
    { get: unused, editable: unused },
    hooks,
  );
  const registry = new AdminUiRegistry(100, access);
  const admin = registry.registrar('example');
  const actions: string[] = [];
  const reads: string[][] = [];

  admin.rowAction('content', 'review', {
    label: 'Review',
    capability: 'content.create',
    run: (id) => {
      actions.push(id);

      return {};
    },
  });
  admin.column('content', 'private', {
    label: 'Private',
    values: (ids) => {
      reads.push(ids);

      return Object.fromEntries(ids.map((id) => [id, 'value']));
    },
  });
  expect(
    await registry.action(
      actor,
      'content',
      'example:review',
      { ids: [other.id, own.id] },
      hooks,
    ),
  ).toEqual({ failed: [other.id] });
  expect(actions).toEqual([own.id]);
  const screen = await registry.screen(actor, 'content', [other.id, own.id]);

  expect(reads).toEqual([[own.id]]);
  expect(screen.values).toEqual({ [own.id]: { 'example:private': 'value' } });
  admin.filter('content', 'search', {
    label: 'Search',
    options: [],
    apply: (query) => query,
  });
  expect((await registry.screen(actor, 'content', [])).filters).toHaveLength(1);
});
