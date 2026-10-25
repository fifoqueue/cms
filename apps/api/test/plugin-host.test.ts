import { describe, expect, test } from 'bun:test';
import { definePlugin } from '@cms/sdk/plugin';
import type { PluginDefinition } from '@cms/sdk/plugin';
import { publicEntry } from '#test/support/content';
import { createRuntime } from '#test/support/runtime';

const content = publicEntry();
const accept = () => true;
const publicView = (runtime: ReturnType<typeof createRuntime>) =>
  runtime.hooks.applyFilter('content.public', content, accept);

/** A runtime on the same storage, booted like a restarted server. */
const restart = async (runtime: ReturnType<typeof createRuntime>) => {
  const restarted = createRuntime({ storage: runtime.storage });
  await restarted.host.boot();
  return restarted;
};

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
  test('installation refuses the reserved core id before activation', async () => {
    const runtime = createRuntime();
    let activated = false;
    const bundle = runtime.bundles.register('reserved-core', {
      manifest: { id: 'core', name: 'Reserved', version: '1.0.0' },
      activate: () => {
        activated = true;
      },
    });
    await expect(runtime.host.install(bundle)).rejects.toMatchObject({
      code: 'invalid_input',
      issues: [
        { path: 'id', message: 'The plugin id "core" is reserved for the CMS' },
      ],
    });
    expect(activated).toBe(false);
    expect(await runtime.host.list()).toEqual([]);
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
        throw new Error('private-api-key-sentinel');
      },
    });
    await runtime.host.install(runtime.bundles.register('b', broken));

    expect(await runtime.host.enable('broken')).toMatchObject({
      enabled: true,
      status: 'failed',
      error: 'Plugin failed. Check server logs for details.',
    });
    expect(JSON.stringify(await runtime.host.list())).not.toContain(
      'private-api-key-sentinel',
    );
    expect(runtime.lines.join('\n')).toContain('private-api-key-sentinel');
    expect((await publicView(runtime)).title).toBe('Hello');
    expect(
      (
        await runtime.slots.render({
          path: '/',
          site: {
            title: 't',
            description: '',
            locale: 'en',
            iconId: null,
            logoId: null,
            loginPath: '/login',
            showLogin: true,
          },
          content: null,
        })
      ).head,
    ).toEqual([]);
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
    const restarted = await restart(runtime);
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
});
