import { expect, test } from 'bun:test';
import { EgressSettingsService } from '#api/domain/security/egress-settings';
import { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { ADMIN, MemorySettings, recordingLogger } from '#test/support/memory';
import { HealthChecks } from '#api/domain/tools/health-checks';
import { Errors } from '#api/shared/errors';

test('health detail counts and lengths are bounded', async () => {
  const checks = new HealthChecks();
  checks.plugin('test', 'length', () => ({
    status: 'good',
    detail: ['x'.repeat(2049)],
  }));
  checks.plugin('test', 'count', () => ({
    status: 'good',
    detail: Array(101).fill('x'),
  }));
  expect((await checks.run()).map((check) => check.detail)).toEqual([
    [
      {
        message: Errors.HealthCheckFailed,
        params: { check: 'plugin:test:length' },
      },
    ],
    [
      {
        message: Errors.HealthCheckFailed,
        params: { check: 'plugin:test:count' },
      },
    ],
  ]);
});

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

test('egress update publishes only after persistence', async () => {
  const settings = new MemorySettings();
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = new EgressSettingsService(settings, [], hooks);
  const events: unknown[] = [];
  hooks.registrar('test').on('egress.updated', (value) => {
    events.push(value);
  });
  const result = await service.update({ rules: [] });
  expect(events).toEqual([result]);
  settings.set = async () => {
    throw new Error('unavailable');
  };
  await expect(service.update({ rules: [] })).rejects.toThrow();
  expect(events).toHaveLength(1);
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
