import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { JobRunner, PermanentJobError } from '#api/domain/jobs/job-runner';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { Scheduler } from '#api/domain/jobs/scheduler';
import { fixedClock, recordingLogger } from '#test/support/memory';
import { MemoryJobQueue, MemoryTaskLeases } from '#test/support/memory-jobs';
import { aesSecretBox } from '#api/infra/secret-box';
import { Errors } from '#api/shared/errors';

describe('scheduler and jobs', () => {
  test('immediate kicks coalesce with a running tick and respect leases held elsewhere', async () => {
    const clock = fixedClock();
    const leases = new MemoryTaskLeases(clock.now);
    const { logger, lines } = recordingLogger();
    const scheduler = new Scheduler({ leases, clock, logger, owner: 'local' });
    let release = () => {};
    let started = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    scheduler.add({
      name: 'immediate',
      intervalMs: 60000,
      run: async () => {
        calls++;
        if (calls === 1) {
          started();
          await gate;
        } else throw new Error('failure');
      },
    });
    const tick = scheduler.tick();
    await entered;
    await Promise.all(
      Array.from({ length: 5 }, () => scheduler.runNow('immediate')),
    );
    release();
    await tick;
    expect(calls).toBe(2);
    expect(lines).toContain('warn Task "immediate" failed: failure');
    expect(
      await leases.claim('immediate', 'remote', 60000, clock.now(), {
        ignoreDue: true,
      }),
    ).toBe(true);
    await scheduler.runNow('immediate');
    expect(calls).toBe(2);
  });

  test('a recurring task runs in one process per interval, even when it fails', async () => {
    const clock = fixedClock();
    const leases = new MemoryTaskLeases(clock.now);
    const runs: string[] = [];
    const processes = ['a', 'b'].map((owner) => {
      const scheduler = new Scheduler({
        leases,
        clock,
        logger: recordingLogger().logger,
        owner,
      });
      scheduler.add({
        name: 'publish',
        intervalMs: 60_000,
        run: async () => {
          runs.push(owner);
          throw new Error('boom');
        },
      });
      return scheduler;
    });

    for (const scheduler of processes) await scheduler.tick();
    expect(runs).toEqual(['a']);
    expect(leases.rows.get('publish')!.lastError).toBe('boom');

    clock.set('2026-01-01T00:01:00.000Z');
    for (const scheduler of [...processes].reverse()) await scheduler.tick();
    expect(runs).toEqual(['a', 'b']);
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

  test('an expired owner cannot complete a job reclaimed elsewhere', async () => {
    const queue = new MemoryJobQueue();
    await queue.enqueue('mail', {});
    const [first] = await queue.claim(1, 'first', 1, new Date(0));
    const [second] = await queue.claim(1, 'second', 1000, new Date(2));

    expect(second?.id).toBe(first?.id);
    expect(await queue.complete(first!.id, 'first')).toBe(false);
    expect(await queue.complete(second!.id, 'second')).toBe(true);
  });

  test('maintenance scrubs historical failed plaintext before retention expires', async () => {
    const clock = fixedClock();
    const queue = new MemoryJobQueue(clock.now);
    await queue.enqueue('legacy', { token: 'plaintext-credential' });
    const row = [...queue.rows.values()][0]!;
    row.failedAt = clock.now();
    row.error = 'old failure';
    const runner = new JobRunner({
      queue,
      clock,
      logger: recordingLogger().logger,
      owner: 'worker',
    });

    expect(await runner.purge()).toBe(0);
    expect(row.payload).toBeNull();
  });

  test('an unreadable sealed job keeps ciphertext and recovers with the right key', async () => {
    const clock = fixedClock();
    const queue = new MemoryJobQueue(clock.now);
    const correct = new SealedJobs(queue, aesSecretBox('correct-job-key'));
    const wrong = new SealedJobs(queue, aesSecretBox('wrong-job-key'));
    const rotated = new SealedJobs(
      queue,
      aesSecretBox('new-active-job-key', 'correct-job-key'),
    );
    const expiresAt = new Date(clock.now().getTime() + 60_000);
    await correct.enqueue('secret', { token: 'credential' }, expiresAt);
    expect([...queue.rows.values()][0]?.expiresAt).toEqual(expiresAt);
    const runner = new JobRunner({
      queue,
      clock,
      logger: recordingLogger().logger,
      owner: 'worker',
    });
    let value = '';
    runner.handle('secret', async (payload) => {
      value = wrong.open(payload, z.object({ token: z.string() })).token;
    });

    await runner.drain();
    expect([...queue.rows.values()][0]?.payload).not.toBeNull();
    expect((await queue.failures(10))[0]?.error).toBe(Errors.JobFailed);
    await rotated.recover(['secret']);
    runner.handle('secret', async (payload) => {
      value = rotated.open(payload, z.object({ token: z.string() })).token;
    });
    await runner.drain();

    expect(value).toBe('credential');
    expect(queue.rows.size).toBe(0);
  });
});
