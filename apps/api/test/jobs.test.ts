import { describe, expect, test } from 'bun:test';
import { JobRunner, PermanentJobError } from '#api/domain/jobs/job-runner';
import { Scheduler } from '#api/domain/jobs/scheduler';
import { fixedClock, recordingLogger } from '#test/support/memory';
import { MemoryJobQueue, MemoryTaskLeases } from '#test/support/memory-jobs';

describe('scheduler and jobs', () => {
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
});
