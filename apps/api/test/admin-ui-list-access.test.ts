import { expect, test } from 'bun:test';
import { z } from 'zod';
import type { AdminScreen } from '@cms/sdk';
import { createAdminUiAccess } from '#api/composition/admin-ui';
import { UserService } from '#api/domain/users/user-service';
import type { UserServiceDeps } from '#api/domain/users/user-service';
import { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { AdminUiRegistry } from '#api/plugin-runtime/admin-ui-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  MemoryContentRepository,
  fixedClock,
  profile,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';

test('list permission is checked before extension filters on every screen', async () => {
  const registry = new AdminUiRegistry();
  const contributor = profile({ id: 'writer', role: 'contributor' });
  let calls = 0;

  for (const screen of [
    'content',
    'media',
    'users',
    'comments',
    'terms',
  ] satisfies AdminScreen[]) {
    registry.registrar('example').filter(screen, 'private', {
      label: 'Private',
      capability: 'content.create',
      options: [],
      apply: (query) => {
        calls++;

        return query;
      },
    });
  }

  const app = await createApiApp({
    logger: recordingLogger().logger,
    services: {
      auth: { authenticate: async () => contributor },
      adminUi: registry,
      users: new UserService({} as UserServiceDeps),
    } as unknown as ApiServices,
  });
  const response = await app.fetch(
    new Request('http://localhost/api/v1/admin/users', {
      headers: { authorization: 'Bearer writer' },
    }),
  );

  expect(response.status).toBe(403);
  expect(calls).toBe(0);

  for (const screen of [
    'content',
    'media',
    'users',
    'comments',
    'terms',
  ] satisfies AdminScreen[]) {
    registry.registrar('example').filter(screen, 'probe', {
      label: 'Probe',
      capability: 'tools.manage',
      options: [],
      apply: (query) => {
        calls++;

        return query;
      },
    });
    await expect(
      registry.apply(
        { id: 'operator', role: 'operator', capabilities: ['tools.manage'] },
        screen,
        {},
        z.object({}),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  }

  expect(calls).toBe(0);
});

test('contributors can use default term filters and columns but not term actions', async () => {
  const logger = recordingLogger().logger;
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const content = new MemoryContentRepository();
  const repository = new MemoryTaxonomyRepository(content);
  const taxonomy = new TaxonomyService({
    content,
    repository,
    hooks,
    ids: sequentialIds(),
    clock: fixedClock(),
  });
  const term = await taxonomy.create('category', { name: 'Selected' });

  await taxonomy.create('category', { name: 'Other' });

  const unused = async (): Promise<never> => {
    throw new Error('Unexpected screen');
  };
  const access = createAdminUiAccess(
    { taxonomyRepository: repository } as unknown as Parameters<
      typeof createAdminUiAccess
    >[0],
    { get: unused },
    { get: unused, editable: unused },
    hooks,
  );
  const registry = new AdminUiRegistry(100, access);
  const admin = registry.registrar('example');
  const contributor = profile({ id: 'writer', role: 'contributor' });
  const selections: unknown[] = [];
  const writes: string[][] = [];

  admin.filter('terms', 'search', {
    label: 'Search',
    options: [{ value: 'Selected', label: 'Selected' }],
    apply: (query) => {
      selections.push(query['filter.example:search']);

      return { ...query, search: query['filter.example:search'] };
    },
  });
  admin.column('terms', 'name', {
    label: 'Name',
    values: (ids) => Object.fromEntries(ids.map((id) => [id, 'Term column'])),
  });
  admin.rowAction('terms', 'row', {
    label: 'Write',
    capability: 'content.create',
    run: (id) => {
      writes.push([id]);

      return {};
    },
  });
  admin.bulkAction('terms', 'bulk', {
    label: 'Write',
    capability: 'content.create',
    run: (ids) => {
      writes.push(ids);

      return {};
    },
  });
  const app = await createApiApp({
    logger,
    services: {
      auth: { authenticate: async () => contributor },
      adminUi: registry,
      adminTaxonomy: taxonomy,
      renderHooks: hooks,
    } as unknown as ApiServices,
  });
  const headers = { authorization: 'Bearer writer' };
  const screen = await app.fetch(
    new Request(
      `http://localhost/api/v1/admin/ui/screens/terms?ids=${term.id}`,
      { headers },
    ),
  );
  const data = await screen.json();

  expect(screen.status).toBe(200);
  expect(data.filters).toEqual([
    {
      key: 'example:search',
      label: 'Search',
      options: [{ value: 'Selected', label: 'Selected' }],
    },
  ]);
  expect(data.values).toEqual({ [term.id]: { 'example:name': 'Term column' } });
  const list = await app.fetch(
    new Request(
      'http://localhost/api/v1/admin/taxonomies/category?filter.example:search=Selected',
      { headers },
    ),
  );

  expect(list.status).toBe(200);
  expect((await list.json()).map((entry: { id: string }) => entry.id)).toEqual([
    term.id,
  ]);
  expect(selections).toEqual(['Selected']);

  for (const action of ['row', 'bulk']) {
    expect(
      await registry.action(
        contributor,
        'terms',
        `example:${action}`,
        { ids: [term.id] },
        hooks,
      ),
    ).toEqual({ failed: [term.id] });
  }

  expect(writes).toEqual([]);
});
