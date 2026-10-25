import { expect, test } from 'bun:test';
import { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { ADMIN, recordingLogger } from '#test/support/memory';

test('dashboard filters can reorder/remove but cannot rewrite or grant widgets', async () => {
  const logger = recordingLogger().logger;
  const hooks = new HookBus({ timeoutMs: 50, logger });
  const registry = new DashboardWidgetRegistry({
    timeoutMs: 50,
    logger,
    hooks,
  });
  for (const key of ['first', 'second'])
    registry.registrar('test').dashboardWidget(key, {
      title: key,
      capability: 'content.create',
      render: () => [],
    });
  registry.registrar('test').dashboardWidget('private', {
    title: 'private',
    capability: 'plugins.manage',
    render: () => [],
  });
  const actor = {
    id: 'author',
    role: 'author',
    capabilities: ['content.create'],
  };
  hooks.registrar('order').filter('dashboard.data', (value) => {
    expect(value.capabilities).toEqual(['content.create']);
    return { ...value, widgets: value.widgets.toReversed() };
  });
  hooks.registrar('rewrite').filter('dashboard.data', (value) => ({
    ...value,
    widgets: value.widgets.map((widget) => ({ ...widget, title: 'forged' })),
  }));
  expect((await registry.render(actor)).map((widget) => widget.title)).toEqual([
    'second',
    'first',
  ]);
  hooks.registrar('remove').filter('dashboard.data', (value) => ({
    ...value,
    widgets: value.widgets.slice(0, 1),
  }));
  expect((await registry.render(actor)).map((widget) => widget.key)).toEqual([
    'second',
  ]);
});

test('dashboard output filters ignore malformed widgets and isolate failures', async () => {
  const logger = recordingLogger().logger;
  const hooks = new HookBus({ timeoutMs: 50, logger });
  const registry = new DashboardWidgetRegistry({
    timeoutMs: 50,
    logger,
    hooks,
  });
  const widget = { plugin: 'test', key: 'extra', title: 'Extra', blocks: [] };
  hooks.registrar('test').filter('dashboard.data', (value) => ({
    ...value,
    widgets: [...value.widgets, widget],
  }));
  hooks.registrar('bad').filter('dashboard.data', () => null as never);
  hooks.registrar('throws').filter('dashboard.data', () => {
    throw new Error('failed');
  });
  expect(await registry.render(ADMIN)).toEqual([]);
});
