import { expect, test } from 'bun:test';
import { FunctionsHost } from '#api/functions-runtime/functions-host';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { PluginContext } from '@cms/sdk/plugin';

test('setup observes both activated sources and themes without functions', async () => {
  const logger = { info() {}, warn() {}, error() {} };
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const events: unknown[] = [];
  let theme = { id: 'first', version: '1.0.0' };
  let revision = 1;
  let activated = 0;
  const host = new FunctionsHost({
    hooks,
    theme: async () => theme,
    sources: async () =>
      revision === 0
        ? []
        : ['theme:first', 'functions:site'].map((owner) => ({
            owner,
            hash: String(revision),
            load: async () => ({
              api() {
                activated++;
              },
            }),
          })),
    context: () => ({}) as PluginContext,
    logger,
    invalidate() {},
  });

  hooks.registrar('observer').on('theme.setup', (event) => {
    events.push({ ...event, activated });
  });
  await host.reconcile();
  await host.reconcile();
  revision++;
  await host.reconcile();
  revision = 0;
  theme = { id: 'second', version: '2.0.0' };
  await host.reconcile();
  expect(events).toEqual([
    { theme: { id: 'first', version: '1.0.0' }, reason: 'boot', activated: 2 },
    {
      theme: { id: 'first', version: '1.0.0' },
      reason: 'reload',
      activated: 4,
    },
    { theme, reason: 'switch', activated: 4 },
  ]);
  await host.stop();
});
