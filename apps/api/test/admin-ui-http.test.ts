import { expect, test } from 'bun:test';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { AdminUiRegistry } from '#api/plugin-runtime/admin-ui-registry';
import { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger, profile } from '#test/support/memory';

test('admin UI endpoints require bearer authentication and bound action input', async () => {
  const logger = recordingLogger().logger;
  const adminUi = new AdminUiRegistry(100, async (_actor, _screen, id) => ({
    kind: 'content',
    id,
  }));
  const pages = new AdminPageRegistry({ timeoutMs: 100, logger });
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const admin = profile({ id: 'admin' });
  const reader = profile({ id: 'reader', role: 'subscriber' });
  let calls = 0;

  adminUi.registrar('example').rowAction('content', 'review', {
    label: 'Review',
    capability: 'content.create',
    run: () => {
      calls++;

      return {};
    },
  });
  const app = await createApiApp({
    logger,
    services: {
      auth: {
        authenticate: async (token: string) =>
          token === 'admin' ? admin : token === 'reader' ? reader : null,
      },
      adminUi,
      pluginPages: pages,
      renderHooks: hooks,
    } as unknown as ApiServices,
  });
  const get = (path: string, token?: string) =>
    app.fetch(
      new Request(`http://localhost/api/v1/admin/ui/${path}`, {
        headers: token
          ? { authorization: `Bearer ${token}` }
          : { cookie: 'session=admin' },
      }),
    );

  for (const path of [
    'menu',
    'notices',
    'screens/content',
    'admin-bar',
    'assets',
  ]) {
    expect((await get(path)).status).toBe(401);
    expect((await get(path, 'admin')).status).toBe(200);
  }

  expect((await get('screens/invalid', 'admin')).status).toBe(400);
  expect(
    (
      await get(
        `screens/content?ids=${Array(101).fill('id').join(',')}`,
        'admin',
      )
    ).status,
  ).toBe(400);
  expect(await (await get('screens/content', 'reader')).json()).toEqual({
    columns: [],
    values: {},
    rowActions: [],
    bulkActions: [],
    filters: [],
  });
  const run = (token: string, ids: string[]) =>
    app.fetch(
      new Request(
        'http://localhost/api/v1/admin/ui/screens/content/actions/example:review',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        },
      ),
    );

  expect((await run('reader', ['id'])).status).toBe(403);
  expect((await run('admin', [])).status).toBe(400);
  expect(calls).toBe(0);
  expect((await run('admin', ['id'])).status).toBe(200);
  expect(calls).toBe(1);
});
