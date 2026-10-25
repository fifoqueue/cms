import { describe, expect, test } from 'bun:test';
import { JobRunner, PermanentJobError } from '#api/domain/jobs/job-runner';
import { fixedClock, recordingLogger } from '#test/support/memory';
import { MemoryJobQueue } from '#test/support/memory-jobs';

describe('scheduler and jobs', () => {
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
