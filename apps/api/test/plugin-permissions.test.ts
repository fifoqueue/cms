import { describe, expect, test } from 'bun:test';
import { pluginCapabilitySchema } from '@cms/sdk';
import type { AdminBlock } from '@cms/sdk';
import { definePlugin } from '@cms/sdk/plugin';
import type { PluginContext } from '@cms/sdk/plugin';
import { PluginGateway } from '#api/http/plugin-gateway';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { ADMIN, profile } from '#test/support/memory';
import { createRuntime } from '#test/support/runtime';

const manifest = { id: 'permissions', name: 'Permissions', version: '1.0.0' };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('plugin permissions', () => {
  test('disposal preserves outcomes of already-dispatched mutations', async () => {
    const runtime = createRuntime();
    const started = deferred<void>();
    const finish = deferred<void>();
    let writes = 0;
    const mutate = async () => {
      writes++;
      if (writes === 2) started.resolve();
      await finish.promise;
    };
    await runtime.host.install(
      runtime.bundles.register(
        'mutations',
        definePlugin({
          manifest,
          activate({ admin, routes }) {
            admin.page('mutate', {
              title: 'Mutate',
              render: () => [
                { kind: 'form', action: 'save', submit: 'Save', fields: [] },
              ],
              actions: {
                save: async () => {
                  await mutate();
                  return { notice: 'Saved' };
                },
              },
            });
            routes.add({
              method: 'POST',
              path: '/mutate',
              access: 'admin',
              handler: async () => {
                await mutate();
                return Response.json({ saved: true }, { status: 201 });
              },
            });
          },
        }),
      ),
    );
    await runtime.host.enable(manifest.id);
    const gateway = new PluginGateway({
      routes: runtime.routes,
      timeoutMs: 100,
      logger: console,
      auth: { authenticate: async () => profile({ id: 'admin' }) },
    });
    const action = runtime.pages.run(manifest.id, 'mutate', 'save', {}, ADMIN);
    const response = Promise.resolve(
      gateway.handle(
        manifest.id,
        new Request('http://localhost/api/plugins/permissions/mutate', {
          method: 'POST',
          headers: { authorization: 'Bearer admin' },
        }),
      ),
    );
    await started.promise;
    await runtime.host.disable(manifest.id);
    finish.resolve();
    expect(await action).toEqual({ notice: 'Saved' });
    const result = await response;
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ saved: true });
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(writes).toBe(2);
  });

  test('only omitted page/widget capabilities default; malformed declarations fail closed', async () => {
    expect(pluginCapabilitySchema.parse(undefined)).toBe('plugins.manage');
    for (const capability of [null, '', 'plugins.mange', '*', false]) {
      expect(pluginCapabilitySchema.safeParse(capability).success).toBe(false);
      for (const kind of ['page', 'dashboardWidget'] as const) {
        const runtime = createRuntime();
        await runtime.host.install(
          runtime.bundles.register(
            'invalid',
            definePlugin({
              manifest,
              activate({ admin, routes }) {
                routes.add({
                  method: 'GET',
                  path: '/',
                  access: 'public',
                  handler: () => Response.json('leak'),
                });
                admin[kind]('invalid', {
                  title: 'Invalid',
                  capability: capability as never,
                  render: () => [],
                });
              },
            }),
          ),
        );
        expect((await runtime.host.enable(manifest.id)).status).toBe('failed');
        expect(runtime.routes.list(manifest.id)).toEqual([]);
      }
    }
  });

  test('context reads cannot reach private reader methods or supply unlock callbacks', async () => {
    const calls: unknown[][] = [];
    const reader = {
      async list() {
        return { items: [], total: 0, page: 1, pageSize: 10 };
      },
      async getBySlug(...args: unknown[]) {
        calls.push(args);
        return null;
      },
      async getPrivateById() {
        return 'private body';
      },
    };
    const runtime = createRuntime({ content: reader });
    let context!: PluginContext;
    await runtime.host.install(
      runtime.bundles.register(
        'reader',
        definePlugin({
          manifest,
          activate(value) {
            context = value;
          },
        }),
      ),
    );
    await runtime.host.enable(manifest.id);
    const unsafe = context.content as unknown as typeof reader;
    expect(unsafe.getPrivateById).toBeUndefined();
    await unsafe.getBySlug(
      'protected',
      () => true,
      () => ({ secret: 'field' }),
    );
    expect(calls).toEqual([['protected']]);
    expect(() =>
      Object.assign(context.content, { getBySlug: () => 'private' }),
    ).toThrow();
  });

  test('old contexts lose data access and cannot replace newer tasks after disable, failure or removal', async () => {
    const runtime = createRuntime();
    const contexts: PluginContext[] = [];
    let runs = 0;
    const plugin = definePlugin({
      manifest,
      activate(context) {
        contexts.push(context);
        context.tasks.every('tick', 60_000, () => {
          runs++;
        });
      },
    });
    await runtime.host.install(runtime.bundles.register('lifetime', plugin));
    await runtime.host.enable(manifest.id);
    const old = contexts[0]!;
    await old.storage.set('value', 'kept');
    const pendingTask = runtime.tasks.get('plugin:permissions:tick')!;
    await runtime.host.disable(manifest.id);
    await runtime.host.enable(manifest.id);
    expect(await contexts[1]!.storage.get('value')).toBe('kept');
    expect(() => old.tasks.every('tick', 60_000, () => {})).toThrow(
      'Plugin is not active',
    );
    expect(runtime.tasks.has('plugin:permissions:tick')).toBe(true);
    await pendingTask.run();
    expect(runs).toBe(0);
    for (const operation of [
      () => old.storage.get('value'),
      () => old.storage.set('value', 'changed'),
      () => old.storage.delete('value'),
      () => old.storage.keys(),
      () => old.settings.get('value'),
      () => old.settings.all(),
      () => old.content.list(),
      () => old.content.getBySlug('post'),
    ])
      await expect(operation()).rejects.toThrow('Plugin is not active');
    expect(await contexts[1]!.storage.get('value')).toBe('kept');
    await runtime.host.remove(manifest.id);
    await expect(
      contexts[1]!.storage.set('value', 'resurrected'),
    ).rejects.toThrow();
    expect(await runtime.data.get(manifest.id, 'kv', 'value')).toBeUndefined();

    await runtime.host.install(
      runtime.bundles.register(
        'failed',
        definePlugin({
          manifest,
          activate(context) {
            contexts.push(context);
            throw new Error('activation failed');
          },
        }),
      ),
    );
    expect((await runtime.host.enable(manifest.id)).status).toBe('failed');
    await expect(
      contexts[2]!.storage.set('value', 'resurrected'),
    ).rejects.toThrow();
  });

  test('an in-flight data read cannot deliver its value after revocation', async () => {
    const runtime = createRuntime();
    let context!: PluginContext;
    await runtime.host.install(
      runtime.bundles.register(
        'read',
        definePlugin({
          manifest,
          activate(value) {
            context = value;
          },
        }),
      ),
    );
    await runtime.host.enable(manifest.id);
    const answer = deferred<unknown>();
    runtime.data.get = () => answer.promise;
    const read = context.storage.get('secret');
    await runtime.host.disable(manifest.id);
    answer.resolve('secret');
    await expect(read).rejects.toThrow('Plugin is not active');
  });

  test('admin page actions require the page grant, an own handler, and a current registration', async () => {
    const runtime = createRuntime();
    let calls = 0;
    let renders = 0;
    const started = deferred<void>();
    const blocks = deferred<AdminBlock[]>();
    const form: AdminBlock = {
      kind: 'form',
      action: 'reset',
      submit: 'Reset',
      fields: [],
    };
    await runtime.host.install(
      runtime.bundles.register(
        'page',
        definePlugin({
          manifest,
          activate({ admin }) {
            admin.page('private', {
              title: 'Private',
              render() {
                renders++;
                return [form];
              },
              actions: {
                reset() {
                  calls++;
                },
              },
            });
            admin.page('inherited', {
              title: 'Inherited',
              render: () => [form],
              actions: Object.create({
                reset() {
                  calls++;
                },
              }) as never,
            });
            admin.page('pending', {
              title: 'Pending',
              capability: 'content.create',
              render() {
                started.resolve();
                return blocks.promise;
              },
              actions: {
                reset() {
                  calls++;
                },
              },
            });
          },
        }),
      ),
    );
    await runtime.host.enable(manifest.id);
    const author = { id: 'author', role: 'author' };
    await expect(
      runtime.pages.run(manifest.id, 'private', 'reset', {}, author),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(renders).toBe(0);
    await expect(
      runtime.pages.run(manifest.id, 'inherited', 'reset', {}, ADMIN),
    ).rejects.toMatchObject({ code: 'not_found' });
    const action = runtime.pages.run(
      manifest.id,
      'pending',
      'reset',
      {},
      author,
    );
    await started.promise;
    await runtime.host.disable(manifest.id);
    await runtime.host.enable(manifest.id);
    blocks.resolve([form]);
    await expect(action).rejects.toMatchObject({ code: 'not_found' });
    expect(calls).toBe(0);
    await runtime.pages.run(manifest.id, 'private', 'reset', {}, ADMIN);
    expect(calls).toBe(1);
  });

  test('pending route authentication cannot dispatch a removed or replaced route', async () => {
    const runtime = createRuntime();
    let calls = 0;
    await runtime.host.install(
      runtime.bundles.register(
        'route',
        definePlugin({
          manifest,
          activate({ routes }) {
            routes.add({
              method: 'GET',
              path: '/',
              access: 'admin',
              handler() {
                calls++;
                return Response.json('private');
              },
            });
          },
        }),
      ),
    );
    await runtime.host.enable(manifest.id);
    const started = deferred<void>();
    const user = deferred<ReturnType<typeof profile>>();
    const gateway = new PluginGateway({
      routes: runtime.routes,
      timeoutMs: 100,
      logger: console,
      auth: {
        authenticate() {
          started.resolve();
          return user.promise;
        },
      },
    });
    const request = new Request(
      `http://localhost/api/plugins/${manifest.id}/`,
      { headers: { authorization: 'Bearer test' } },
    );
    const pending = Promise.resolve(gateway.handle(manifest.id, request));
    await started.promise;
    await runtime.host.disable(manifest.id);
    await runtime.host.enable(manifest.id);
    user.resolve(profile({ id: 'admin' }));
    expect((await pending).status).toBe(404);
    expect(calls).toBe(0);
    const response = await gateway.handle(manifest.id, request);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(calls).toBe(1);
  });

  test('boot and reconciliation reject a bundle claiming another plugin data namespace', async () => {
    const first = createRuntime();
    let activations = 0;
    const plugin = definePlugin({
      manifest: { ...manifest },
      activate() {
        activations++;
      },
    });
    await first.host.install(first.bundles.register('identity', plugin));
    await first.host.enable(manifest.id);
    plugin.manifest.id = 'other-plugin';
    const booted = createRuntime({ storage: first.storage });
    await booted.host.boot();
    const reconciled = createRuntime({ storage: first.storage });
    await reconciled.host.reconcile();
    expect((await booted.host.list())[0]?.status).toBe('failed');
    expect((await reconciled.host.list())[0]?.status).toBe('failed');
    expect(activations).toBe(1);
  });

  test('management endpoints check effective grants before any bundle import or state change', async () => {
    const runtime = createRuntime();
    let imports = 0;
    const load = runtime.bundles.load.bind(runtime.bundles);
    runtime.bundles.load = async (path) => {
      imports++;
      return load(path);
    };
    runtime.bundles.register(
      'bundle',
      definePlugin({ manifest, activate() {} }),
    );
    let capabilities: ('plugins.manage' | 'settings.manage')[] = [
      'settings.manage',
    ];
    const app = await createApiApp({
      services: {
        plugins: runtime.host,
        auth: {
          authenticate: async () =>
            profile({ id: 'admin', role: 'administrator', capabilities }),
        },
      } as unknown as ApiServices,
      logger: console,
    });
    const call = (method: string, path: string, token = true, body?: string) =>
      app.fetch(
        new Request(`http://localhost/api/v1/admin/plugins${path}`, {
          method,
          body,
          headers: token ? { authorization: 'Bearer current' } : {},
        }),
      );
    for (const [method, path] of [
      ['GET', ''],
      ['POST', ''],
      ['POST', '/permissions/enable'],
      ['POST', '/permissions/disable'],
      ['DELETE', '/permissions'],
      ['PUT', '/permissions/settings'],
      ['GET', '/permissions/update'],
    ]) {
      expect((await call(method!, path!, false)).status).toBe(401);
      expect((await call(method!, path!)).status).toBe(403);
    }
    expect(imports).toBe(0);
    expect(await runtime.host.list()).toEqual([]);
    capabilities = ['plugins.manage'];
    expect((await call('POST', '', true, 'bundle')).status).toBe(201);
    expect(imports).toBe(1);
    capabilities = [];
    expect((await call('POST', '/permissions/enable')).status).toBe(403);
    expect((await runtime.host.list())[0]?.enabled).toBe(false);
  });
});
