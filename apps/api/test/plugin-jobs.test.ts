import { expect, test } from 'bun:test';
import { z } from 'zod';
import { PluginJobs } from '#api/domain/jobs/plugin-jobs';
import { JobRunner } from '#api/domain/jobs/job-runner';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';
import { aesSecretBox } from '#api/infra/secret-box';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import { fixedClock, recordingLogger } from '#test/support/memory';
import { Errors } from '#api/shared/errors';

test('plugin jobs bound UTF-8 bytes and persist input, not schema transforms', async () => {
  const queue = new MemoryJobQueue();
  const clock = fixedClock();
  const sealed = new SealedJobs(queue, aesSecretBox('test'));
  const runner = new JobRunner({
    queue,
    clock,
    owner: 'test',
    logger: recordingLogger().logger,
  });
  const jobs = new PluginJobs(runner, sealed, clock).registrar('test');
  jobs.register('value', {
    schema: z.string().transform((value) => value + '!'),
    run() {},
  });
  await expect(jobs.enqueue('value', '界'.repeat(22_000))).rejects.toThrow(
    Errors.JobPayloadInvalid,
  );
  await jobs.enqueue('value', 'original');
  expect(sealed.open([...queue.rows.values()][0]!.payload, z.string())).toBe(
    'original',
  );
});

test('registered plugin kinds recover unreadable payloads after restoring the key', async () => {
  const clock = fixedClock();
  const queue = new MemoryJobQueue(clock.now);
  const correct = new SealedJobs(queue, aesSecretBox('correct'));
  const wrong = new SealedJobs(queue, aesSecretBox('wrong'));
  const runner = new JobRunner({
    queue,
    clock,
    owner: 'test',
    logger: recordingLogger().logger,
  });
  const first = new PluginJobs(runner, wrong, clock).registrar('test');
  const release = first.register('recover', { schema: z.string(), run() {} });
  await correct.enqueue('plugin:test:recover', 'payload');
  await runner.drain();
  expect([...queue.rows.values()][0]!.error).toBe(Errors.JobPayloadUnreadable);
  release();
  let ran = false;
  new PluginJobs(runner, correct, clock).registrar('test').register('recover', {
    schema: z.string(),
    run() {
      ran = true;
    },
  });
  await correct.recover(runner.kinds());
  await runner.drain();
  expect(ran).toBe(true);
});

test('plugin jobs validate, seal, delay, retry and revoke handlers', async () => {
  const queue = new MemoryJobQueue();
  const clock = fixedClock();
  const runner = new JobRunner({
    queue,
    clock,
    owner: 'test',
    logger: recordingLogger().logger,
  });
  const jobs = new PluginJobs(
    runner,
    new SealedJobs(queue, aesSecretBox('job-test')),
    clock,
  ).registrar('example');
  const scope = new PluginScope();
  let attempts = 0;
  scope.track(() =>
    jobs.register('send', {
      schema: z.object({ email: z.email() }),
      run: () => {
        if (++attempts === 1) throw new Error('retry');
      },
    }),
  );
  await expect(jobs.enqueue('send', { email: 'invalid' })).rejects.toThrow();
  await jobs.enqueue(
    'send',
    { email: 'private@example.com' },
    { delayMs: 1000 },
  );
  expect(JSON.stringify([...queue.rows.values()])).not.toContain(
    'private@example.com',
  );
  await runner.drain();
  expect(attempts).toBe(0);
  clock.set('2026-01-01T00:00:01.000Z');
  await runner.drain();
  expect(attempts).toBe(1);
  clock.set('2026-01-01T00:01:02.000Z');
  await runner.drain();
  expect(attempts).toBe(2);
  await jobs.enqueue('send', { email: 'private@example.com' });
  scope.dispose();
  await runner.drain();
  expect(attempts).toBe(2);
  await expect(
    jobs.enqueue('send', { email: 'private@example.com' }),
  ).rejects.toThrow();
});
