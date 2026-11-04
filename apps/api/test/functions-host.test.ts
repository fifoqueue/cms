import { expect, test } from 'bun:test';
import type { PluginContext } from '@cms/sdk/plugin';
import { FunctionsHost } from '#api/functions-runtime/functions-host';
import type { FunctionsSource } from '#api/functions-runtime/functions-host';
import { HookBus } from '#api/plugin-runtime/hook-bus';

for (const listenerFirst of [false, true]) {
  test(`custom hook reload preserves generations and other owners (listener first: ${listenerFirst})`, async () => {
    const logger = { info() {}, warn() {}, error() {} };
    const bus = new HookBus({ timeoutMs: 100, logger });
    const plugin = bus.registrar('plugin');
    plugin.filter('site.label', (value) => `${value}:plugin`, 20);
    let version = 1;
    let fail = false;
    const host = new FunctionsHost({
      sources: async () => [
        {
          owner: 'functions:site',
          hash: `${version}`,
          load: async () => {
            const loaded = version;
            return {
              api(ctx) {
                const define = () =>
                  ctx.hooks.define('site.label', {
                    kind: 'filter',
                    validate: (value) => typeof value === 'string',
                  });
                if (!listenerFirst) define();
                ctx.hooks.filter('site.label', (value) => `${value}:${loaded}`);
                if (listenerFirst) define();
                if (fail)
                  ctx.hooks.define('content.created', {
                    kind: 'action',
                    validate: () => true,
                  });
              },
            };
          },
        },
      ],
      context: (owner, scope) => {
        const hooks = bus.registrar(owner, { trusted: true });
        return {
          hooks: {
            ...hooks,
            define: (name, contract) =>
              scope.track(() => hooks.define(name, contract)),
            on: (name, handler, priority) =>
              scope.track(() => hooks.on(name, handler, priority)),
            filter: (name, handler, priority) =>
              scope.track(() => hooks.filter(name, handler, priority)),
          },
        } as PluginContext;
      },
      logger,
      invalidate() {},
    });
    await host.reconcile();
    expect(await plugin.apply('site.label', 'start')).toBe('start:1:plugin');
    version = 2;
    await host.reconcile();
    expect(host.status()[0]!.lastError).toBeNull();
    expect(await plugin.apply('site.label', 'start')).toBe('start:2:plugin');
    expect(() =>
      plugin.define('site.label', { kind: 'filter', validate: () => true }),
    ).toThrow();
    version = 3;
    fail = true;
    await host.reconcile();
    expect(host.status()[0]!.lastError).toBe('activation_failed');
    expect(host.status()[0]!.loadedHash).toBe('2');
    expect(await plugin.apply('site.label', 'start')).toBe('start:2:plugin');
    await host.stop();
    expect(plugin.has('site.label')).toBe(true);
    expect(await plugin.apply('site.label', 'start')).toBe('start');
  });
}

test('old hooks stay available during slow load and failed activation', async () => {
  let fire = () => '';
  let unblock!: () => void;
  let entered!: () => void;
  const loading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let slow = false;
  const host = new FunctionsHost({
    sources: async () => [
      {
        owner: 'functions:site',
        hash: slow ? 'broken' : 'good',
        load: async () => {
          if (slow) {
            entered();
            await held;
            throw new Error('broken');
          }
          return { api() {} };
        },
      },
    ],
    context: (_owner, scope) => {
      scope.track(() => {
        fire = () => 'protected';
        return () => {
          fire = () => '';
        };
      });
      return {} as PluginContext;
    },
    logger: { info() {}, warn() {}, error() {} },
    invalidate() {},
  });
  await host.reconcile();
  slow = true;
  const pending = host.reconcile();
  await loading;
  expect(fire()).toBe('protected');
  unblock();
  await pending;
  expect(fire()).toBe('protected');
  expect(host.status()[0]!.lastError).toBe('activation_failed');
  await host.stop();
});

test('failed edits release partial registrations and restore the last good source in precedence order', async () => {
  const live: string[] = [];
  let sources: FunctionsSource[] = [
    {
      owner: 'theme:journal',
      hash: 'theme-one',
      load: async () => ({ api: () => {} }),
    },
    {
      owner: 'functions:site',
      hash: 'site-one',
      load: async () => ({ api: () => {} }),
    },
  ];
  const host = new FunctionsHost({
    sources: async () => sources,
    context: (owner, scope) => {
      scope.track(() => {
        live.push(owner);
        return () => {
          live.splice(live.indexOf(owner), 1);
        };
      });
      return {} as PluginContext;
    },
    logger: { info() {}, warn() {}, error() {} },
    invalidate() {},
  });
  await host.reconcile();
  expect(live).toEqual(['theme:journal', 'functions:site']);
  sources = [
    sources[0]!,
    {
      owner: 'functions:site',
      hash: 'site-broken',
      load: async () => ({
        api: () => {
          throw new Error('private credentials');
        },
      }),
    },
  ];
  await host.reconcile();
  expect(live).toEqual(['theme:journal', 'functions:site']);
  expect(host.status()[1]).toEqual({
    owner: 'functions:site',
    observedHash: 'site-broken',
    loadedHash: 'site-one',
    lastError: 'activation_failed',
    updatedAt: expect.any(String),
  });
  await host.reconcile();
  expect(live).toEqual(['theme:journal', 'functions:site']);
  sources = [sources[1]!];
  await host.reconcile();
  expect(live).toEqual(['functions:site']);
  await host.stop();
  expect(live).toEqual([]);
});
