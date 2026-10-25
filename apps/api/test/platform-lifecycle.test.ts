import { expect, test } from 'bun:test';
import { z } from 'zod';
import { definePlugin } from '@cms/sdk/plugin';
import type { PluginContext } from '@cms/sdk/plugin';
import { createRuntime } from '#test/support/runtime';
import { HealthChecks } from '#api/domain/tools/health-checks';
import { SiteHealthService } from '#api/domain/tools/site-health';
import { ADMIN, fixedClock } from '#test/support/memory';
import { Errors } from '#api/shared/errors';

test('PluginHost disable revokes mail, job and health registrations and late access', async () => {
  const runtime = createRuntime();
  let context!: PluginContext;
  let runs = 0;
  const plugin = definePlugin({
    manifest: { id: 'platform-test', name: 'Platform', version: '1.0.0' },
    activate(ctx) {
      context = ctx;
      ctx.mailTransports.register('mail', {
        label: 'Mail',
        fields: [],
        send() {
          runs++;
        },
      });
      ctx.jobs.register('job', {
        schema: z.object({ value: z.string() }),
        run() {
          runs++;
        },
      });
      ctx.healthChecks.register('health', () => ({
        status: 'good',
        detail: [],
      }));
    },
  });
  await runtime.host.install(runtime.bundles.register('platform', plugin));
  await runtime.host.enable('platform-test');
  const transport = {
    kind: 'plugin' as const,
    id: 'plugin:platform-test:mail',
    settings: {},
    from: { name: '', email: 'sender@example.com' },
  };
  const message = { to: 'reader@example.com', subject: 'Test', text: 'Body' };
  await runtime.mailTransports.send(transport, message);
  await context.jobs.enqueue('job', { value: 'test' });
  await runtime.jobRunner.drain();
  expect(runs).toBe(2);
  expect(await runtime.healthChecks.run()).toHaveLength(1);
  await context.jobs.enqueue('job', { value: 'pending' });
  await runtime.host.disable('platform-test');
  expect(await runtime.healthChecks.run()).toEqual([]);
  await expect(
    runtime.mailTransports.send(transport, message),
  ).rejects.toThrow();
  await runtime.jobRunner.drain();
  expect(runs).toBe(2);
  await expect(
    context.jobs.enqueue('job', { value: 'late' }),
  ).rejects.toThrow();
  expect(() =>
    context.healthChecks.register('late', () => ({
      status: 'good',
      detail: [],
    })),
  ).toThrow();
  expect(() =>
    context.mailTransports.register('late', {
      label: 'Late',
      fields: [],
      send() {},
    }),
  ).toThrow();
});

test('core health check errors propagate while plugin failures become check failed results', async () => {
  const checks = new HealthChecks(10);
  let searchError: Error | null = null;
  const service = new SiteHealthService({
    checks,
    clock: fixedClock(),
    siteUrl: async () => 'https://example.com',
    emailEnabled: async () => true,
    search: async () => {
      if (searchError) throw searchError;
      return {
        engine: 'database',
        state: 'ready',
        pending: 0,
        documents: null,
        lastError: null,
        lastSyncAt: null,
      };
    },
    leases: { list: async () => [] },
    jobs: {
      failures: async () => [
        {
          kind: 'webhook.deliver',
          error: Errors.JobFailed,
          failedAt: fixedClock().now(),
        },
      ],
    },
    plugins: async () => [],
    visitorProof: () => true,
    info: { cms: '1', runtime: 'test', database: async () => 'db' },
  });
  checks.plugin('test', 'invalid', () => ({ status: 'invalid' }));
  checks.plugin('test', 'throws', () => {
    throw new Error('secret');
  });
  checks.plugin('test', 'timeout', () => new Promise(() => {}));
  const report = await service.report(ADMIN);
  expect(report.checks).toHaveLength(10);
  for (const key of [
    'plugin:test:invalid',
    'plugin:test:throws',
    'plugin:test:timeout',
  ] as const)
    expect(report.checks.find((check) => check.key === key)).toEqual({
      key,
      status: 'critical',
      detail: [{ message: Errors.HealthCheckFailed, params: { check: key } }],
    });
  expect(report.checks.find((check) => check.key === 'jobs')).toEqual({
    key: 'jobs',
    status: 'recommended',
    detail: [
      { message: Errors.HealthJobFailed, params: { kind: 'webhook.deliver' } },
    ],
  });
  expect(report.checks.find((check) => check.key === 'email')?.status).toBe(
    'good',
  );
  searchError = new Error('search status unavailable');
  await expect(service.report(ADMIN)).rejects.toBe(searchError);
});
