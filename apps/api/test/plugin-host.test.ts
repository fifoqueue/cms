import { describe, expect, test } from 'bun:test';
import type { PublicContent } from '@cms/sdk';
import { definePlugin } from '@cms/sdk/plugin';
import type { PluginDefinition } from '@cms/sdk/plugin';
import { DomainError } from '../src/shared/errors';
import { createRuntime } from './support/runtime';

const content: PublicContent = {
  id: '1',
  type: 'post',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  html: '<p>Hi</p>',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  meta: {},
};
const accept = () => true;
const publicView = (runtime: ReturnType<typeof createRuntime>) =>
  runtime.hooks.applyFilter('content.public', content, accept);

const titlePlugin = (id = 'title-suffix', suffix = '!'): PluginDefinition =>
  definePlugin({
    manifest: { id, name: 'Title suffix', version: '1.0.0' },
    activate({ hooks }) {
      hooks.filter('content.public', (value) => ({
        ...value,
        title: value.title + suffix,
      }));
    },
  });

describe('PluginHost lifecycle', () => {
  test('install leaves a plugin inactive until enabled, and disable releases everything', async () => {
    const runtime = createRuntime();
    const info = await runtime.host.install(
      runtime.bundles.register('a', titlePlugin()),
    );
    expect(info).toMatchObject({
      id: 'title-suffix',
      enabled: false,
      status: 'inactive',
    });
    expect((await publicView(runtime)).title).toBe('Hello');

    expect(await runtime.host.enable('title-suffix')).toMatchObject({
      enabled: true,
      status: 'active',
    });
    expect((await publicView(runtime)).title).toBe('Hello!');

    expect(await runtime.host.disable('title-suffix')).toMatchObject({
      enabled: false,
      status: 'inactive',
    });
    expect((await publicView(runtime)).title).toBe('Hello');
  });

  test('a plugin that throws during activation is marked failed and leaves nothing behind', async () => {
    const runtime = createRuntime();
    const broken = definePlugin({
      manifest: { id: 'broken', name: 'Broken', version: '1.0.0' },
      activate({ hooks, slots }) {
        hooks.filter('content.public', (value) => ({
          ...value,
          title: 'hijacked',
        }));
        slots.provide('head', () => '<meta name="x">');
        throw new Error('boom');
      },
    });
    await runtime.host.install(runtime.bundles.register('b', broken));

    expect(await runtime.host.enable('broken')).toMatchObject({
      enabled: true,
      status: 'failed',
      error: 'boom',
    });
    expect((await publicView(runtime)).title).toBe('Hello');
    expect(
      (
        await runtime.slots.render({
          path: '/',
          site: { title: 't', description: '', locale: 'en' },
          content: null,
        })
      ).head,
    ).toEqual([]);
  });

  test('activation that never resolves times out', async () => {
    const runtime = createRuntime({ timeoutMs: 20 });
    const hanging = definePlugin({
      manifest: { id: 'hanging', name: 'Hanging', version: '1.0.0' },
      activate: () => new Promise(() => {}),
    });
    await runtime.host.install(runtime.bundles.register('h', hanging));
    const info = await runtime.host.enable('hanging');
    expect(info.status).toBe('failed');
    expect(info.error).toContain('Timed out');
  });

  test('rejects bundles that do not follow the plugin contract', async () => {
    const runtime = createRuntime();
    const cases = [
      runtime.bundles.register('none', undefined),
      runtime.bundles.register('no-activate', {
        manifest: { id: 'x', name: 'X', version: '1' },
      }),
      runtime.bundles.register('bad-id', {
        manifest: { id: 'Bad Id', name: 'X', version: '1' },
        activate() {},
      }),
      'not-registered',
    ];
    for (const source of cases) {
      const error = await runtime.host
        .install(source)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('invalid_input');
    }
    expect(await runtime.host.list()).toEqual([]);
  });

  test('registrations attempted after deactivation are refused', async () => {
    const runtime = createRuntime();
    let late: (() => void) | undefined;
    await runtime.host.install(
      runtime.bundles.register(
        'z',
        definePlugin({
          manifest: { id: 'zombie', name: 'Zombie', version: '1.0.0' },
          activate({ hooks }) {
            late = () =>
              hooks.filter('content.public', (value) => ({
                ...value,
                title: 'zombie',
              }));
          },
        }),
      ),
    );
    await runtime.host.enable('zombie');
    await runtime.host.disable('zombie');
    expect(() => late?.()).toThrow('Plugin is not active');
    expect((await publicView(runtime)).title).toBe('Hello');
  });

  test('upgrade keeps enabled state and data; remove deletes everything', async () => {
    const runtime = createRuntime();
    const counter = (version: string) =>
      definePlugin({
        manifest: {
          id: 'counter',
          name: 'Counter',
          version,
          settings: [
            { key: 'step', label: 'Step', type: 'number', default: 1 },
          ],
        },
        async activate({ storage, routes }) {
          await storage.set(
            'installs',
            ((await storage.get<number>('installs')) ?? 0) + 1,
          );
          routes.add({
            method: 'GET',
            path: '/version',
            access: 'public',
            handler: () => Response.json(version),
          });
        },
      });

    await runtime.host.install(
      runtime.bundles.register('v1', counter('1.0.0')),
    );
    await runtime.host.enable('counter');
    expect(
      (await runtime.host.updateSettings('counter', { step: 5 })).values,
    ).toEqual({ step: 5 });

    const upgraded = await runtime.host.install(
      runtime.bundles.register('v2', counter('2.0.0')),
    );
    expect(upgraded).toMatchObject({
      version: '2.0.0',
      enabled: true,
      status: 'active',
      values: { step: 5 },
    });
    expect(await runtime.data.get('counter', 'kv', 'installs')).toBe(2);
    expect(runtime.routes.list('counter')).toHaveLength(1);

    await runtime.host.remove('counter');
    expect(await runtime.host.list()).toEqual([]);
    expect(runtime.data.rows.size).toBe(0);
    expect(runtime.routes.list('counter')).toHaveLength(0);
  });

  test('settings are validated against the manifest', async () => {
    const runtime = createRuntime();
    await runtime.host.install(
      runtime.bundles.register(
        's',
        definePlugin({
          manifest: {
            id: 'settings',
            name: 'Settings',
            version: '1.0.0',
            settings: [
              { key: 'label', label: 'Label', type: 'text', default: 'hi' },
            ],
          },
          activate() {},
        }),
      ),
    );
    expect((await runtime.host.list())[0]?.values).toEqual({ label: 'hi' });
    await expect(
      runtime.host.updateSettings('settings', { label: 3 }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      runtime.host.updateSettings('settings', { other: 'x' }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  test('boot survives a bundle that can no longer be loaded', async () => {
    const runtime = createRuntime();
    await runtime.host.install(
      runtime.bundles.register('good', titlePlugin('good')),
    );
    await runtime.host.install(
      runtime.bundles.register('gone', titlePlugin('gone', '?')),
    );
    await runtime.host.enable('good');
    await runtime.host.enable('gone');
    await runtime.host.stop();
    runtime.bundles.modules.delete('gone');

    const restarted = createRuntime({ storage: runtime.storage });
    await restarted.host.boot();

    const statuses = Object.fromEntries(
      (await restarted.host.list()).map((plugin) => [plugin.id, plugin.status]),
    );
    expect(statuses).toEqual({ good: 'active', gone: 'failed' });
    expect((await publicView(restarted)).title).toBe('Hello!');
  });
});

/**
 * Makes saving plugin state throw and reading it fail, like a database outage.
 * With `persisted`, each save is written before it throws, like a lost commit acknowledgement.
 * Returns the restore function.
 */
const failState = (
  runtime: ReturnType<typeof createRuntime>,
  { persisted = false } = {},
) => {
  const { state } = runtime.storage;
  const save = state.save.bind(state);
  const list = state.list.bind(state);
  const outage = () => Promise.reject(new Error('database unavailable'));

  state.save = async (record) => {
    if (persisted) await save(record);
    return outage();
  };
  state.list = outage;

  return () => {
    state.save = save;
    state.list = list;
  };
};

describe('PluginHost install atomicity', () => {
  test('an unsaved upgrade keeps the previous version running and both bundles until a later upgrade succeeds', async () => {
    const runtime = createRuntime();
    await runtime.host.install(
      runtime.bundles.register('v1', titlePlugin('upgrade', '!')),
    );
    await runtime.host.enable('upgrade');
    const restoreState = failState(runtime);

    await expect(
      runtime.host.install(
        runtime.bundles.register('v2', titlePlugin('upgrade', '?')),
      ),
    ).rejects.toThrow('database unavailable');
    expect(await runtime.host.list()).toMatchObject([
      { id: 'upgrade', enabled: true, status: 'active' },
    ]);
    expect((await publicView(runtime)).title).toBe('Hello!');
    expect([...runtime.bundles.files.values()]).toEqual(['v1', 'v2']);
    restoreState();

    await runtime.host.stop();
    const restarted = createRuntime({ storage: runtime.storage });
    await restarted.host.boot();
    expect(await restarted.host.list()).toMatchObject([
      { id: 'upgrade', enabled: true, status: 'active' },
    ]);
    expect((await publicView(restarted)).title).toBe('Hello!');

    expect(
      await restarted.host.install(
        runtime.bundles.register('v2', titlePlugin('upgrade', '?')),
      ),
    ).toMatchObject({ enabled: true, status: 'active' });
    expect((await publicView(restarted)).title).toBe('Hello?');
    expect([...runtime.bundles.files.values()]).toEqual(['v2']);
  });

  test('an upgrade saved before the save threw boots the new version after a restart', async () => {
    const runtime = createRuntime();
    await runtime.host.install(
      runtime.bundles.register('v1', titlePlugin('upgrade', '!')),
    );
    await runtime.host.enable('upgrade');
    const restoreState = failState(runtime, { persisted: true });

    await expect(
      runtime.host.install(
        runtime.bundles.register('v2', titlePlugin('upgrade', '?')),
      ),
    ).rejects.toThrow('database unavailable');
    expect((await publicView(runtime)).title).toBe('Hello!');
    expect([...runtime.bundles.files.values()]).toEqual(['v1', 'v2']);
    restoreState();

    await runtime.host.stop();
    const restarted = createRuntime({ storage: runtime.storage });
    await restarted.host.boot();
    expect(await restarted.host.list()).toMatchObject([
      { id: 'upgrade', enabled: true, status: 'active' },
    ]);
    expect((await publicView(restarted)).title).toBe('Hello?');
  });

  test('a first install whose save threw keeps its bundle and stays loadable after a restart', async () => {
    const runtime = createRuntime();
    const restoreState = failState(runtime, { persisted: true });

    await expect(
      runtime.host.install(runtime.bundles.register('a', titlePlugin())),
    ).rejects.toThrow('database unavailable');
    expect(await runtime.host.list()).toEqual([]);
    expect([...runtime.bundles.files.values()]).toEqual(['a']);
    expect((await publicView(runtime)).title).toBe('Hello');
    restoreState();

    const restarted = createRuntime({ storage: runtime.storage });
    await restarted.host.boot();
    expect(await restarted.host.list()).toMatchObject([
      { id: 'title-suffix', enabled: false, status: 'inactive' },
    ]);
    expect((await publicView(restarted)).title).toBe('Hello');
  });

  test('an upgrade that cannot delete the superseded bundle still completes and survives a restart', async () => {
    const runtime = createRuntime();
    await runtime.host.install(
      runtime.bundles.register('v1', titlePlugin('upgrade', '!')),
    );
    await runtime.host.enable('upgrade');

    const { bundles } = runtime;
    const commit = bundles.commit.bind(bundles);
    bundles.commit = async (bundle, pluginId) => ({
      ...(await commit(bundle, pluginId)),
      prune: () => Promise.reject(new Error('disk busy')),
    });

    expect(
      await runtime.host.install(
        bundles.register('v2', titlePlugin('upgrade', '?')),
      ),
    ).toMatchObject({ enabled: true, status: 'active' });
    expect((await publicView(runtime)).title).toBe('Hello?');
    expect(runtime.lines).toContain(
      'warn Could not delete superseded bundles of plugin "upgrade": disk busy',
    );

    await runtime.host.stop();
    const restarted = createRuntime({ storage: runtime.storage });
    await restarted.host.boot();
    expect((await publicView(restarted)).title).toBe('Hello?');
  });
});
