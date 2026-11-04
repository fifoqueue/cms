import { expect, test } from 'bun:test';
import { AdminUiRegistry as Registry } from '#api/plugin-runtime/admin-ui-registry';
import { z } from 'zod';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';
import { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import { adminMenu, adminBar } from '#api/http/admin-menu';
import { userQuerySchema, adminTermListQuerySchema } from '@cms/sdk';

class AdminUiRegistry extends Registry {
  constructor(timeoutMs?: number) {
    super(timeoutMs, async (_actor, _screen, id) => ({ kind: 'content', id }));
  }
}

test('registered selections reach filters and invalid selections are rejected', async () => {
  const registry = new AdminUiRegistry();
  const actor = { id: 'admin', role: 'administrator' };
  const admin = registry.registrar('example');

  for (const screen of [
    'content',
    'media',
    'users',
    'comments',
    'terms',
  ] as const) {
    admin.filter(screen, 'search', {
      label: 'Search',
      options: [{ value: 'selected', label: 'Selected' }],
      apply: (query) => ({ ...query, search: query['filter.example:search'] }),
    });
    expect(
      await registry.apply(
        actor,
        screen,
        {
          'filter.example:search': 'selected',
        },
        z.object({ search: z.string().optional() }),
      ),
    ).toEqual({ search: 'selected' });

    for (const query of [
      { 'filter.example:search': 'invalid' },
      { 'filter.unknown:search': 'selected' },
      { 'filter.example:search': ['selected'] },
    ]) {
      await expect(
        registry.apply(actor, screen, query, userQuerySchema),
      ).rejects.toThrow();
    }
  }

  expect(
    await registry.apply(
      actor,
      'users',
      {
        search: 'original',
        'filter.example:search': 'selected',
      },
      userQuerySchema,
    ),
  ).toEqual({ search: 'selected' });
  expect(
    await registry.apply(
      actor,
      'terms',
      {
        taxonomy: 'category',
        hideEmpty: 'true',
        'filter.example:search': 'selected',
      },
      adminTermListQuerySchema,
    ),
  ).toEqual({ taxonomy: 'category', hideEmpty: true, search: 'selected' });
  await expect(
    registry.apply(
      { id: 'reader', role: 'subscriber' },
      'users',
      {
        'filter.example:search': 'selected',
      },
      userQuerySchema,
    ),
  ).rejects.toThrow();
});

test('notice and asset scopes match route identifiers exactly', async () => {
  const registry = new AdminUiRegistry();
  const admin = registry.registrar('example');
  const actor = { id: 'admin', role: 'administrator' };

  for (const screen of [
    'content',
    'content/[id]',
    'tools/functions',
    'dashboard',
  ]) {
    let calls = 0;
    const release = admin.notice('scoped', {
      screens: [screen],
      render: () => {
        calls++;

        return [];
      },
    });
    const releaseAsset = admin.assets('style', {
      kind: 'style',
      src: 'https://example.com/style.css',
      placement: 'head',
      attrs: {},
      screens: [screen],
    });

    await registry.notices(actor, screen);
    await registry.notices(actor, `${screen}/other`);
    expect(calls).toBe(1);
    expect(registry.assets(actor, screen)).toHaveLength(1);
    expect(registry.assets(actor, `${screen}/other`)).toEqual([]);
    release();
    releaseAsset();
  }
});

test('trusted menu filters cannot inject unauthorized navigation', async () => {
  const logger = recordingLogger().logger;
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const pages = new AdminPageRegistry({ timeoutMs: 100, logger });
  const registrar = hooks.registrar('site', { trusted: true });
  const actor = { id: 'reader', role: 'subscriber' };

  registrar.filter('admin.menu', (value) => {
    value.items.push({
      key: 'settings',
      label: 'Settings',
      href: '/admin/settings',
      parent: null,
      position: 0,
      core: true,
      labelOverridden: false,
      hidden: false,
    });

    return value;
  });
  registrar.filter('adminBar.items', (value) => {
    value.items.push({
      key: 'settings',
      label: 'Settings',
      href: '/admin/settings',
    });

    return value;
  });
  expect(await adminMenu(actor, pages, hooks)).toEqual({ items: [] });
  expect(await adminBar(actor, pages, hooks)).toEqual({ items: [] });
});

test('unused registry preserves queries without invoking validation', async () => {
  const registry = new AdminUiRegistry();
  const query = { page: 1 };
  let validations = 0;
  const schema = z.object({ page: z.number() }).refine(() => {
    validations++;

    return true;
  });

  expect(
    await registry.apply(
      { id: 'admin', role: 'administrator' },
      'content',
      query,
      schema,
    ),
  ).toBe(query);
  expect(validations).toBe(0);
});

test('bulk actions recheck each object and report refused ids', async () => {
  const registry = new AdminUiRegistry();
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const seen: string[] = [];
  const executed: string[][] = [];

  hooks.registrar('policy').filter('capability.check', (value) => {
    seen.push(value.object.id);

    return { ...value, allowed: value.object.id !== 'denied' };
  });
  registry.registrar('example').bulkAction('content', 'review', {
    label: 'Review',
    capability: 'content.create',
    run: (ids) => {
      executed.push(ids);

      return {};
    },
  });
  expect(
    await registry.action(
      { id: 'admin', role: 'administrator' },
      'content',
      'example:review',
      {
        ids: ['allowed', 'denied'],
      },
      hooks,
    ),
  ).toEqual({ failed: ['denied'] });
  expect(seen).toEqual(['allowed', 'denied']);
  expect(executed).toEqual([['allowed']]);
});

test('row actions recheck policy after preceding writes', async () => {
  const registry = new AdminUiRegistry();
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  let allowed = true;
  const ran: string[] = [];

  hooks
    .registrar('policy')
    .filter('capability.check', (value) => ({ ...value, allowed }));
  registry.registrar('example').rowAction('content', 'review', {
    label: 'Review',
    capability: 'content.create',
    run: (id) => {
      ran.push(id);
      allowed = false;

      return {};
    },
  });
  expect(
    await registry.action(
      { id: 'admin', role: 'administrator' },
      'content',
      'example:review',
      {
        ids: ['first', 'second'],
      },
      hooks,
    ),
  ).toEqual({ failed: ['second'] });
  expect(ran).toEqual(['first']);
});

test('screen callbacks validate output and enforce action capabilities', async () => {
  const registry = new AdminUiRegistry();
  const admin = registry.registrar('example');
  const actor = { id: 'admin', role: 'administrator' };
  const called: string[] = [];

  admin.column('content', 'summary', {
    label: 'Summary',
    values: () => ({ one: 'Plain text', unrequested: 'Hidden' }),
  });
  admin.rowAction('content', 'review', {
    label: 'Review',
    capability: 'content.create',
    run: (id) => {
      called.push(id);

      return {};
    },
  });
  admin.filter('content', 'invalid', {
    label: 'Invalid',
    options: [],
    apply: () => ({ page: -1 }),
  });
  const screen = await registry.screen(actor, 'content', ['one']);

  expect(screen.values).toEqual({ one: { 'example:summary': 'Plain text' } });
  expect(
    await registry.apply(
      actor,
      'content',
      { page: 1 },
      z.object({
        page: z.number().int().positive(),
      }),
    ),
  ).toEqual({ page: 1 });
  await expect(
    registry.action(
      { id: 'reader', role: 'subscriber' },
      'content',
      'example:review',
      {
        ids: ['one'],
      },
    ),
  ).rejects.toThrow();
  expect(called).toEqual([]);
  expect(
    await registry.action(actor, 'content', 'example:review', {
      ids: ['one', 'one'],
    }),
  ).toEqual({ failed: [] });
  expect(called).toEqual(['one']);
});

test('admin notices isolate failures and exclude unauthorized callbacks', async () => {
  const registry = new AdminUiRegistry(5);
  const admin = registry.registrar('example');
  let calls = 0;

  admin.notice('private', {
    render: () => {
      calls++;

      return [];
    },
  });
  admin.notice('failed', {
    render: () => {
      throw new Error('private failure');
    },
  });
  admin.notice('hanging', { render: () => new Promise(() => {}) });
  expect(
    await registry.notices({ id: 'reader', role: 'subscriber' }, 'content'),
  ).toEqual([]);
  expect(calls).toBe(0);
  expect(
    await registry.notices({ id: 'admin', role: 'administrator' }, 'content'),
  ).toEqual([]);
  expect(calls).toBe(1);
});

test('admin registrations validate definitions and release independently', () => {
  const registry = new AdminUiRegistry();
  const admin = registry.registrar('example');

  expect(registry.empty).toBe(true);
  expect(() =>
    admin.column('content', 'bad key', {
      label: 'Column',
      values: () => ({}),
    }),
  ).toThrow();
  const release = admin.notice('notice', { render: () => [] });

  expect(registry.empty).toBe(false);
  release();
  expect(registry.empty).toBe(true);
});
