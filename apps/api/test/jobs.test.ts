import { describe, expect, test } from 'bun:test';
import { JobRunner, PermanentJobError } from '#api/domain/jobs/job-runner';
import { fixedClock, recordingLogger } from '#test/support/memory';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import { MemoryTaskLeases } from '#test/support/memory-jobs';
import { Scheduler } from '#api/domain/jobs/scheduler';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { definePlugin } from '@cms/sdk/plugin';
import { createRuntime } from '#test/support/runtime';

test('isolated plugin task failure emits failed with a core-owned message', async () => {
  const runtime = createRuntime();
  const manifest = { id: 'task-test', name: 'Task test', version: '1.0.0' };
  const secret = new Error('private plugin error');
  const plugin = definePlugin({
    manifest,
    activate(context) {
      context.tasks.every('broken', 60000, () => {
        throw secret;
      });
    },
  });

  await runtime.host.install(runtime.bundles.register('task-test', plugin));
  await runtime.host.enable(manifest.id);
  const clock = fixedClock();
  const leases = new MemoryTaskLeases(clock.now);
  const events: string[] = [];
  const scheduler = new Scheduler({
    leases,
    clock,
    hooks: runtime.hooks,
    logger: recordingLogger().logger,
    owner: 'test',
  });

  runtime.hooks.core('test').on('task.failed', () => {
    events.push('failed');
  });
  runtime.hooks.core('test').on('task.completed', () => {
    events.push('completed');
  });
  scheduler.add(runtime.tasks.get('plugin:task-test:broken')!);
  await scheduler.runNow('plugin:task-test:broken');
  expect(events).toEqual(['failed']);
  expect(leases.rows.get('plugin:task-test:broken')?.lastError).not.toContain(
    'private',
  );
  await runtime.host.disable(manifest.id);
});

test('rejecting completion subscriber cannot retry a completed job', async () => {
  const clock = fixedClock();
  const logger = recordingLogger();
  const hooks = new HookBus({ timeoutMs: 50, logger: logger.logger });
  const queue = new MemoryJobQueue(clock.now);
  let failures = 0;
  const fail = queue.fail.bind(queue);

  queue.fail = async (...args) => {
    failures++;

    return fail(...args);
  };

  hooks.core('test').on('job.completed', () => {
    throw new Error('subscriber failed');
  });
  const runner = new JobRunner({
    queue,
    hooks,
    clock,
    logger: logger.logger,
    owner: 'test',
  });

  runner.handle('ok', async () => {});
  await queue.enqueue('ok', {});
  await queue.enqueue('ok', {});
  await runner.drain();
  expect(failures).toBe(0);
  expect(queue.rows.size).toBe(0);
  expect(logger.lines.length).toBeGreaterThan(0);
});

test('rejecting task subscribers observe released leases on success and failure', async () => {
  const clock = fixedClock();
  const leases = new MemoryTaskLeases(clock.now);
  const logger = recordingLogger();
  const hooks = new HookBus({ timeoutMs: 50, logger: logger.logger });
  const released: boolean[] = [];
  const scheduler = new Scheduler({
    leases,
    clock,
    hooks,
    logger: logger.logger,
    owner: 'test',
  });

  for (const name of ['task.completed', 'task.failed'] as const)
    hooks.core('test').on(name, ({ name }) => {
      released.push(leases.rows.get(name)?.lockedBy === null);
      throw new Error('subscriber failed');
    });
  scheduler.add({ name: 'ok', intervalMs: 60000, run: async () => {} });
  scheduler.add({
    name: 'bad',
    intervalMs: 60000,
    run: async () => {
      throw new Error('task failed');
    },
  });
  await scheduler.tick();
  expect(released).toEqual([true, true]);
  expect(leases.rows.get('ok')?.lockedBy).toBeNull();
  expect(leases.rows.get('bad')?.lockedBy).toBeNull();
  expect(logger.lines.length).toBeGreaterThan(0);
});

test('job and leased task actions report outcomes without private payloads', async () => {
  const clock = fixedClock();
  const logger = recordingLogger().logger;
  const hooks = new HookBus({ timeoutMs: 50, logger });
  const registrar = hooks.registrar('functions:site', { trusted: true });
  const events: unknown[] = [];

  registrar.on('job.completed', (value) => {
    events.push(value);
  });
  registrar.on('task.completed', (value) => {
    events.push(value);
  });
  registrar.on('task.failed', (value) => {
    events.push(value);
  });
  const queue = new MemoryJobQueue(clock.now);
  const runner = new JobRunner({ hooks, queue, clock, logger, owner: 'a' });
  const scheduler = new Scheduler({
    hooks,
    leases: new MemoryTaskLeases(clock.now),
    clock,
    logger,
    owner: 'a',
  });

  runner.handle('mail', async () => {});
  await queue.enqueue('mail', { token: 'private' });
  scheduler.add(runner.task(5000));
  scheduler.add({
    name: 'broken',
    intervalMs: 60000,
    run: async () => {
      throw new Error('private token');
    },
  });
  await scheduler.runNow('jobs');
  await scheduler.runNow('broken');
  await scheduler.tick();
  expect(events).toEqual([
    { id: 'job-1', kind: 'mail', attempts: 1 },
    { name: 'jobs', durationMs: expect.any(Number) },
    { name: 'broken', durationMs: expect.any(Number) },
  ]);
});

describe('scheduler and jobs', () => {
  test('interval filters run on registration and respect identity and safe floors', async () => {
    const clock = fixedClock();
    const logger = recordingLogger().logger;
    const hooks = new HookBus({ timeoutMs: 50, logger });
    const leases = new MemoryTaskLeases(clock.now);
    const scheduler = new Scheduler({
      hooks,
      leases,
      clock,
      logger,
      owner: 'a',
    });
    let calls = 0;

    hooks
      .registrar('functions:site', { trusted: true })
      .filter('task.interval', (value) => {
        calls++;

        return { ...value, intervalMs: value.name === 'jobs' ? 1000 : 120000 };
      });
    scheduler.add({ name: 'jobs', intervalMs: 5000, run: async () => {} });
    const remove = scheduler.add({
      name: 'plugin:test:task',
      intervalMs: 60000,
      run: async () => {},
    });

    await scheduler.tick();
    expect(leases.rows.get('jobs')?.nextRunAt.getTime()).toBe(
      clock.now().getTime() + 5000,
    );
    expect(leases.rows.get('plugin:test:task')?.nextRunAt.getTime()).toBe(
      clock.now().getTime() + 120000,
    );
    await scheduler.runNow('jobs');
    expect(calls).toBe(2);
    remove();
    expect(scheduler.names()).toEqual(['jobs']);
  });

  test('failed jobs retry with backoff and give up when permanent', async () => {
    const clock = fixedClock();
    const queue = new MemoryJobQueue(clock.now);
    const runner = new JobRunner({
      queue,
      clock,
      logger: recordingLogger().logger,
      owner: 'a',
    });
    let attempts = 0;

    runner.handle('flaky', async () => {
      if (++attempts < 2) throw new Error('later');
    });
    runner.handle('broken', async () => {
      throw new PermanentJobError('never');
    });
    await queue.enqueue('flaky', {});
    await queue.enqueue('broken', {});

    await runner.drain();
    expect(attempts).toBe(1);
    expect(await queue.failures(10)).toMatchObject([{ kind: 'broken' }]);
    expect(
      [...queue.rows.values()].find((row) => row.kind === 'broken')?.payload,
    ).toBeNull();

    // Not due until the backoff has passed.
    await runner.drain();
    expect(attempts).toBe(1);
    clock.set('2026-01-01T00:01:00.000Z');
    await runner.drain();
    expect(attempts).toBe(2);
    expect([...queue.rows.values()].map((row) => row.kind)).toEqual(['broken']);

    clock.set('2026-02-01T00:00:00.001Z');
    expect(await runner.purge()).toBe(1);
    expect(queue.rows.size).toBe(0);
  });
});
