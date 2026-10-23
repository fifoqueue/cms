import { describe, expect, test } from 'bun:test';
import type { PublicContent } from '@cms/sdk';
import { DEFAULT_SITE_SETTINGS, toPublicEntrySeo } from '@cms/sdk';
import { definePlugin } from '@cms/sdk/plugin';
import type { PluginDefinition } from '@cms/sdk/plugin';
import { PublishedContentReader } from '#api/domain/content/public-content';
import { SiteService } from '#api/domain/site/site-service';
import { WidgetService } from '#api/domain/appearance/widget-service';
import { SlotService } from '#api/plugin-runtime/slot-service';
import { DomainError } from '#api/shared/errors';
import {
  ADMIN,
  MemoryContentRepository,
  MemorySettings,
} from '#test/support/memory';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { MemorySeoSettingsRepository } from '#test/support/memory-seo';
import { createRuntime } from '#test/support/runtime';

const content: PublicContent = {
  id: '1',
  type: 'post',
  slug: 'hello',
  path: '/hello',
  seo: toPublicEntrySeo({}),
  title: 'Hello',
  excerpt: '',
  html: '<p>Hi</p>',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  categories: [],
  tags: [],
  extraTerms: [],
  author: null,
  sticky: false,
  commentCount: 0,
  protected: false,
  featuredImage: null,
  fields: {},
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
          },
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
    expect(info.error).toBe('Plugin failed. Check server logs for details.');
    expect(runtime.lines.join('\n')).toContain('Timed out');
  });

  test('import diagnostics stay in server logs rather than API errors', async () => {
    const runtime = createRuntime();
    const source = runtime.bundles.register('secret-import', titlePlugin());
    runtime.bundles.load = async () => {
      throw new Error('private-import-sentinel');
    };
    await expect(runtime.host.install(source)).rejects.toMatchObject({
      code: 'invalid_input',
      message: 'Could not import plugin bundle',
    });
    expect(runtime.lines.join('\n')).toContain('private-import-sentinel');
    expect(await runtime.host.list()).toEqual([]);
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

  test('requirements block activation with a reason, and required plugins boot first', async () => {
    const runtime = createRuntime();
    const needing = (id: string, requires: object) =>
      definePlugin({
        manifest: { id, name: id, version: '1.0.0', requires },
        activate({ hooks }) {
          hooks.filter('content.public', (value) => ({
            ...value,
            title: `${value.title}+${id}`,
          }));
        },
      });
    // Installed before the plugin it needs, so boot must reorder them.
    await runtime.host.install(
      runtime.bundles.register(
        'a',
        needing('addon', { plugins: { base: '^1' } }),
      ),
    );
    await runtime.host.install(
      runtime.bundles.register('b', needing('base', { cms: '>=1.0.0' })),
    );
    await runtime.host.install(
      runtime.bundles.register('c', needing('future', { cms: '>=9' })),
    );
    expect(await runtime.host.enable('addon')).toMatchObject({
      status: 'failed',
      error: 'Needs the plugin "base" ^1, active',
    });
    expect(await runtime.host.enable('future')).toMatchObject({
      status: 'failed',
      error: 'Needs CMS >=9; this site runs 1.0.0',
    });
    await runtime.host.enable('base');
    await runtime.host.stop();

    const restarted = createRuntime({ storage: runtime.storage });
    await restarted.host.boot();
    const statuses = Object.fromEntries(
      (await restarted.host.list()).map((plugin) => [plugin.id, plugin.status]),
    );
    expect(statuses).toEqual({
      addon: 'active',
      base: 'active',
      future: 'failed',
    });
    expect((await publicView(restarted)).title).toBe('Hello+base+addon');
  });

  test("update checks read the plugin's update address only", async () => {
    const runtime = createRuntime();
    const url = 'https://plugins.example/updatable.json';
    await runtime.host.install(
      runtime.bundles.register(
        'u',
        definePlugin({
          manifest: {
            id: 'updatable',
            name: 'U',
            version: '1.2.0',
            updateUrl: url,
          },
          activate() {},
        }),
      ),
    );
    runtime.feeds.set(url, {
      version: '1.10.0',
      download: 'https://plugins.example/u.js',
    });
    expect(await runtime.host.checkUpdate('updatable')).toEqual({
      current: '1.2.0',
      latest: '1.10.0',
      newer: true,
      download: 'https://plugins.example/u.js',
    });
    runtime.feeds.set(url, { nope: true });
    expect(
      await runtime.host
        .checkUpdate('updatable')
        .catch((error: DomainError) => error.code),
    ).toBe('invalid_input');
  });

  test('slots always cover every name, and read site and content only while a renderer is registered', async () => {
    const runtime = createRuntime();
    const settings = new MemorySeoSettingsRepository();
    const repository = new MemoryContentRepository();
    const reads: string[] = [];
    let onRead = async () => {};
    const get = settings.get.bind(settings);
    settings.get = async (key) => {
      reads.push(key);
      await onRead();
      return get(key);
    };
    const findById = repository.findById.bind(repository);
    repository.findById = (id) => {
      reads.push(id);
      return findById(id);
    };
    const service = new SlotService({
      registry: runtime.slots,
      site: new SiteService(settings, runtime.hooks, async () => new Map()),
      content: new PublishedContentReader(
        new MemoryPublishedContentRepository(repository),
      ),
      paths: repository.permalinks,
    });
    const render = () => service.render({ path: '/hello', contentId: '1' });
    const none = {
      head: [],
      'site.header': [],
      'site.footer': [],
      'content.before': [],
      'content.after': [],
      'comments.before': [],
      'comments.after': [],
    };

    await runtime.host.install(
      runtime.bundles.register(
        'f',
        definePlugin({
          manifest: { id: 'footer', name: 'Footer', version: '1.0.0' },
          activate({ slots }) {
            slots.provide('site.footer', ({ site }) => `<p>${site.title}</p>`);
            slots.provide('content.after', () => {
              throw new Error('render failed');
            });
          },
        }),
      ),
    );
    expect(await render()).toEqual(none);
    expect(reads).toEqual([]);

    await runtime.host.enable('footer');
    expect(await render()).toEqual({
      ...none,
      'site.footer': [`<p>${DEFAULT_SITE_SETTINGS.title}</p>`],
    });
    expect(reads).toEqual(['site', '1']);
    expect(runtime.lines.join('\n')).toContain(
      'failed to render slot "content.after"',
    );

    // Disabled while the request reads its context: the released renderers never run.
    onRead = () => runtime.host.disable('footer').then(() => {});
    expect(await render()).toEqual(none);
    reads.length = 0;
    expect(await render()).toEqual(none);
    expect(reads).toEqual([]);
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

test('plugin widgets, embeds and tasks work while active; failing or disabled ones leave core intact', async () => {
  const runtime = createRuntime();
  const content = new MemoryContentRepository();
  const widgets = new WidgetService({
    settings: new MemorySettings(),
    published: new MemoryPublishedContentRepository(content),
    terms: { list: async () => [] },
    menus: { publicItems: async () => null },
    comments: { recent: async () => [] },
    plugins: runtime.widgets,
  });
  await runtime.host.install(
    runtime.bundles.register(
      'w',
      definePlugin({
        manifest: { id: 'greeter', name: 'Greeter', version: '1.0.0' },
        activate({ widgets: registrar, embeds, tasks }) {
          embeds.register({ name: 'maps', render: () => '<iframe></iframe>' });
          tasks.every('cleanup', 1000, () => undefined);
          registrar.provide('hello', {
            name: 'Hello',
            render: () => '<p>hi</p>',
          });
          registrar.provide('broken', {
            name: 'Broken',
            render: () => {
              throw new Error('boom');
            },
          });
        },
      }),
    ),
  );
  await runtime.host.enable('greeter');
  expect(widgets.types(ADMIN).plugins.map((type) => type.type)).toEqual([
    'plugin:greeter:hello',
    'plugin:greeter:broken',
  ]);
  await widgets.update(
    {
      sidebar: [
        { id: 'a', type: 'search' },
        { id: 'b', type: 'plugin:greeter:hello' },
        { id: 'c', type: 'plugin:greeter:broken' },
      ],
    },
    ADMIN,
  );
  expect((await widgets.getPublic()).sidebar.map((w) => w.kind)).toEqual([
    'search',
    'html',
  ]);

  expect(runtime.embeds.providers().map((provider) => provider.name)).toEqual([
    'greeter:maps',
  ]);
  // Plugin tasks run at most once a minute.
  expect(runtime.tasks.get('plugin:greeter:cleanup')?.intervalMs).toBe(60_000);

  await runtime.host.disable('greeter');
  expect(runtime.embeds.providers()).toEqual([]);
  expect(runtime.tasks.size).toBe(0);
  expect(widgets.types(ADMIN).plugins).toEqual([]);
  expect((await widgets.getPublic()).sidebar.map((w) => w.kind)).toEqual([
    'search',
  ]);
});

test('plugin admin pages are data, checked, authorized and released with the plugin', async () => {
  const runtime = createRuntime();
  const saved: unknown[] = [];
  await runtime.host.install(
    runtime.bundles.register(
      'p',
      definePlugin({
        manifest: { id: 'stats', name: 'Stats', version: '1.0.0' },
        activate({ admin }) {
          admin.page('overview', {
            title: 'Overview',
            render: () => [
              { kind: 'stats', items: [{ label: 'Views', value: '42' }] },
              {
                kind: 'form',
                action: 'reset',
                submit: 'Reset',
                fields: [{ key: 'days', label: 'Days', type: 'number' }],
              },
            ],
            actions: {
              reset: (values) => {
                saved.push(values);
                return { notice: 'Done' };
              },
            },
          });
          admin.page('broken', {
            title: 'Broken',
            render: () => [{ kind: 'html', html: '<script>' }] as never,
          });
        },
      }),
    ),
  );
  await runtime.host.enable('stats');
  const editor = { id: 'e', role: 'editor' };
  expect(runtime.pages.list(editor)).toEqual([]);
  expect(runtime.pages.list(ADMIN).map((page) => page.key)).toEqual([
    'overview',
    'broken',
  ]);
  expect(
    await runtime.pages
      .render('stats', 'overview', editor)
      .catch((error: DomainError) => error.code),
  ).toBe('forbidden');
  expect(
    (await runtime.pages.render('stats', 'overview', ADMIN))?.blocks,
  ).toHaveLength(2);
  // Anything outside the block schema (markup included) never reaches the admin area.
  expect(await runtime.pages.render('stats', 'broken', ADMIN)).toBeNull();
  expect(
    await runtime.pages
      .run('stats', 'overview', 'reset', { days: 'many' }, ADMIN)
      .catch((error: DomainError) => error.code),
  ).toBe('invalid_input');
  expect(
    await runtime.pages.run('stats', 'overview', 'reset', { days: 7 }, ADMIN),
  ).toEqual({ notice: 'Done' });
  expect(saved).toEqual([{ days: 7 }]);

  await runtime.host.disable('stats');
  expect(runtime.pages.list(ADMIN)).toEqual([]);
});

test('another instance follows installs, upgrades, toggles and removals', async () => {
  const first = createRuntime();
  const second = createRuntime({ storage: first.storage });
  await second.host.boot();

  await first.host.install(
    first.bundles.register('v1', titlePlugin('shared', '!')),
  );
  await first.host.enable('shared');
  await second.host.reconcile();
  expect((await publicView(second)).title).toBe('Hello!');

  await first.host.install(
    first.bundles.register('v2', titlePlugin('shared', '?')),
  );
  await second.host.reconcile();
  expect((await publicView(second)).title).toBe('Hello?');

  await first.host.disable('shared');
  await second.host.reconcile();
  expect((await publicView(second)).title).toBe('Hello');

  await first.host.remove('shared');
  await second.host.reconcile();
  expect(await second.host.list()).toEqual([]);
});

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
