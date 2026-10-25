import { expect, test } from 'bun:test';
import type { PluginContext } from '@cms/sdk/plugin';
import { createRuntime } from '#test/support/runtime';

test('all discovery and appearance registrars are revoked with plugin context', async () => {
  const runtime = createRuntime();
  let context!: PluginContext;
  const register = () => [
    context.sitemaps.register('extra', () => ({ items: [], total: 0 })),
    context.searchEngines.register('extra', () => null),
    context.menuItemTypes.register('extra', () => null),
    context.themeContributions.register('extra', () => null),
    context.patterns.register('extra', []),
  ];
  await runtime.host.install(
    runtime.bundles.register('providers', {
      manifest: { id: 'providers', name: 'Providers', version: '1.0.0' },
      activate(value: PluginContext) {
        context = value;
        register();
      },
    }),
  );
  expect((await runtime.host.enable('providers')).status).toBe('active');
  await runtime.host.disable('providers');
  expect(() =>
    context.sitemaps.register('late', () => null as never),
  ).toThrow();
  expect(() => context.searchEngines.register('late', () => null)).toThrow();
  expect(() => context.menuItemTypes.register('late', () => null)).toThrow();
  expect(() =>
    context.themeContributions.register('late', () => null),
  ).toThrow();
  expect(() => context.patterns.register('late', [])).toThrow();
});
