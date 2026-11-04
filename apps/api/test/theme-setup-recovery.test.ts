import { expect, test } from 'bun:test';
import { FunctionsHost } from '#api/functions-runtime/functions-host';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { PluginContext } from '@cms/sdk/plugin';

const logger = { info() {}, warn() {}, error() {} };

test('setup handlers can await reconciliation without deadlocking', async () => {
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const host = new FunctionsHost({
    hooks,
    logger,
    invalidate() {},
    theme: async () => ({ id: 'theme', version: '1' }),
    sources: async () => [],
    context: () => ({}) as PluginContext,
  });
  let completed = false;

  hooks
    .registrar('functions:site', { trusted: true })
    .on('theme.setup', async () => {
      await host.reconcile();
      completed = true;
    });
  await host.reconcile();
  expect(completed).toBe(true);
  await host.stop();
}, 1000);

test('failed activation defers setup until the same source succeeds', async () => {
  const hooks = new HookBus({ timeoutMs: 100, logger });
  let fail = true;
  const events: string[] = [];
  const host = new FunctionsHost({
    hooks,
    logger,
    invalidate() {},
    theme: async () => ({ id: 'theme', version: '1' }),
    sources: async () => [
      {
        owner: 'functions:site',
        hash: 'same',
        load: async () => ({
          api() {
            if (fail) throw new Error('activation');
          },
        }),
      },
    ],
    context: () => ({}) as PluginContext,
  });

  hooks.registrar('observer').on('theme.setup', ({ reason }) => {
    events.push(reason);
  });
  await host.reconcile();
  expect(events).toEqual([]);
  expect(host.status()[0]?.lastError).toBe('activation_failed');
  fail = false;
  await host.reconcile();
  await host.reconcile();
  expect(events).toEqual(['boot']);
  await host.stop();
});
