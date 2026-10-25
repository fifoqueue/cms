import { expect, test } from 'bun:test';
import {
  MediaCleanup,
  MEDIA_CLEANUP_JOB,
} from '#api/domain/media/media-cleanup';
import { StorageDrivers } from '#api/domain/media/storage-drivers';
import { StorageResync } from '#api/domain/media/storage-resync';
import { JobRunner } from '#api/domain/jobs/job-runner';
import { MemoryJobQueue, MemoryTaskLeases } from '#test/support/memory-jobs';
import {
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { Errors } from '#api/shared/errors';
import type { MediaStorage } from '#api/domain/media/ports';

const journal = () => {
  const values = new Map<string, unknown>();
  let time = Date.now();
  const settings = {
    get: async (key: string) => structuredClone(values.get(key)),
    set: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    list: async (prefix: string) =>
      Object.fromEntries([...values].filter(([key]) => key.startsWith(prefix))),
    count: async () => values.size,
  };
  return {
    now: () => time,
    advance: () => {
      time += 3600001;
    },
    catalog: {
      page: async (after: string, limit: number) =>
        [...values]
          .filter(
            ([key, value]) =>
              key.startsWith('media.cleanup.') &&
              key > after &&
              value !== null &&
              typeof value === 'object',
          )
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, limit)
          .map(([key, value]) => ({ key, value })),
      attention: async () =>
        [...values.values()].filter(
          (value) =>
            value &&
            typeof value === 'object' &&
            'attempts' in value &&
            Number(value.attempts) >= 5,
        ).length,
    },
    values,
    settings,
    transactions: {
      run: async <T>(
        key: string,
        task: (store: typeof settings) => Promise<T>,
      ) => {
        await settings.set(key, true);
        return task(settings);
      },
    },
  };
};

test('scrubbed terminal deletion jobs regenerate from tombstones on resync and driver reactivation', async () => {
  const store = journal();
  const queue = new MemoryJobQueue();
  const { logger } = recordingLogger();
  const drivers = new StorageDrivers(logger, 50);
  const deleted: string[] = [];
  const finalized: string[] = [];
  let offline = true;
  const definition = {
    label: 'Remote',
    fields: [],
    connect: (): MediaStorage => ({
      commit: async () => 'stored',
      read: async () => null,
      remove: async (keys) => {
        if (offline) throw new Error('provider credential detail');
        deleted.push(...keys);
      },
    }),
  };
  const dispose = drivers.plugin('archive', 'remote', definition);
  const makeCleanup = () =>
    new MediaCleanup({
      ...store,
      queue,
      logger,
      storage: async (driver) => {
        const result = drivers.get(driver);
        if (!result) throw new Error(Errors.MediaDriverInvalid);
        return result;
      },
      finalize: async (id) => {
        finalized.push(id);
      },
    });
  let cleanup = makeCleanup();
  const runner = new JobRunner({
    queue,
    logger,
    clock: fixedClock(),
    owner: 'test',
    maxAttempts: 1,
  });
  runner.handle(MEDIA_CLEANUP_JOB, (payload) =>
    cleanup.run((payload as { id: string }).id),
  );
  const objects = [{ driver: 'plugin:archive:remote', key: 'original' }];
  await expect(cleanup.deletion('first', objects)).rejects.toThrow(
    Errors.MediaStorageOperation,
  );
  await runner.drain();
  expect([...queue.rows.values()].every((row) => row.payload === null)).toBe(
    true,
  );
  await queue.scrubFailed([], 100);
  await queue.purge(new Date('9999-01-01'));
  expect(queue.rows.size).toBe(0);
  expect(await store.settings.get('media.cleanup.delete.first')).toMatchObject({
    mediaId: 'first',
    objects,
  });
  cleanup = makeCleanup(); // Restart: recovery does not depend on adapter or job objects.
  store.advance();
  offline = false;
  const resync = new StorageResync({
    ...store,
    queue,
    leases: new MemoryTaskLeases(),
    clock: fixedClock(),
    ids: sequentialIds(),
    driver: async () => 'local',
    recoverCleanup: () => cleanup.recover(),
    reconcile: async () => ({
      scanned: 0,
      refreshed: 0,
      missing: 0,
      untracked: 0,
    }),
  });
  runner.handle('media.storage.resync', (payload) => resync.run(payload));
  await resync.enqueue();
  await runner.drain();
  expect(finalized).toEqual(['first']);
  expect(deleted).toContain('original');
  expect(await store.settings.get('media.cleanup.delete.first')).toBeNull();

  offline = true;
  await expect(cleanup.deletion('second', objects)).rejects.toThrow();
  await runner.drain();
  await queue.purge(new Date('9999-01-01'));
  dispose();
  offline = false;
  store.advance();
  let recovery = Promise.resolve();
  drivers.onRegistered = (driver) => (recovery = cleanup.recover(driver));
  drivers.plugin('archive', 'remote', definition);
  await recovery;
  await runner.drain();
  expect(finalized).toEqual(['first', 'second']);
});

test('disposal retains a bounded exact-key rollback capability and an uncertain durable intent for late writes', async () => {
  const store = journal();
  const queue = new MemoryJobQueue();
  const { logger } = recordingLogger();
  const drivers = new StorageDrivers(logger, 20);
  const files = new Set<string>();
  const admitted = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const dispose = drivers.plugin('archive', 'remote', {
    label: 'Remote',
    fields: [],
    connect: () => ({
      commit: async (objects) => {
        admitted.resolve();
        await finish.promise;
        for (const { key } of objects) files.add(key);
        return 'stored';
      },
      read: async () => null,
      remove: async (keys) => {
        keys.forEach((key) => files.delete(key));
      },
    }),
  });
  const storage = drivers.get('plugin:archive:remote')!;
  const write = storage.commit(
    [{ key: 'late', bytes: new Uint8Array([1]) }],
    0,
  );
  const rejected = expect(write).rejects.toThrow(Errors.MediaStorageOperation);
  await admitted.promise;
  dispose();
  await rejected;
  const cleanup = new MediaCleanup({
    ...store,
    queue,
    logger,
    storage: async (driver) => {
      const result = drivers.get(driver);
      if (!result) throw new Error(Errors.MediaDriverInvalid);
      return result;
    },
    finalize: async () => undefined,
  });
  expect(
    await cleanup.rollback(
      'upload',
      'plugin:archive:remote',
      ['late'],
      storage,
    ),
  ).toBe(false);
  expect(
    await store.settings.get('media.cleanup.rollback.upload'),
  ).toMatchObject({
    uncertain: true,
    objects: [{ driver: 'plugin:archive:remote', key: 'late' }],
  });
  await expect(storage.rollback!(['unrelated'])).rejects.toThrow();
  finish.resolve();
  await storage.settled!();
  // Settlement enqueues a second cleanup without invoking the expired revoked capability.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(files.has('late')).toBe(true);
  drivers.plugin('archive', 'remote', {
    label: 'Remote',
    fields: [],
    connect: () => ({
      commit: async () => 'stored',
      read: async () => null,
      remove: async (keys) => {
        keys.forEach((key) => files.delete(key));
      },
    }),
  });
  await cleanup.run('rollback.upload');
  expect(files.size).toBe(0);
  expect(await store.settings.get('media.cleanup.rollback.upload')).toBeNull();
});

test('admitted writes can roll back immediately after disposal, but not arbitrary keys or new work', async () => {
  const drivers = new StorageDrivers(undefined, 100);
  const files = new Set<string>();
  const dispose = drivers.plugin('archive', 'remote', {
    label: 'Remote',
    fields: [],
    connect: () => ({
      commit: async (objects) => {
        objects.forEach(({ key }) => files.add(key));
        return 'stored';
      },
      read: async () => null,
      remove: async (keys) => {
        keys.forEach((key) => files.delete(key));
      },
    }),
  });
  const storage = drivers.get('plugin:archive:remote')!;
  await storage.commit([{ key: 'admitted', bytes: new Uint8Array([1]) }], 0);
  dispose();
  await expect(storage.remove(['admitted'])).rejects.toThrow();
  await expect(storage.rollback!(['other'])).rejects.toThrow();
  await storage.rollback!(['admitted']);
  expect(files.size).toBe(0);
});

test('recovery pages, deduplicates outstanding jobs, backs off, and retains exhausted tombstones', async () => {
  const store = journal();
  const queue = new MemoryJobQueue();
  const { logger } = recordingLogger();
  const cleanup = new MediaCleanup({
    ...store,
    queue,
    logger,
    storage: async () => {
      throw new Error('offline');
    },
    finalize: async () => undefined,
  });
  for (let i = 0; i < 51; i++)
    await store.settings.set(
      `media.cleanup.delete.${String(i).padStart(3, '0')}`,
      {
        mediaId: String(i),
        objects: [{ driver: 'local', key: String(i) }],
        uncertain: false,
      },
    );
  await cleanup.recover();
  expect(queue.rows.size).toBe(50);
  await cleanup.recover();
  expect(queue.rows.size).toBe(51);
  await cleanup.recover();
  expect(queue.rows.size).toBe(51);
  // A future clock must not duplicate still-outstanding work.
  store.advance();
  await cleanup.recover();
  expect(queue.rows.size).toBe(51);
  const first = 'media.cleanup.delete.000';
  expect(await store.settings.get(first)).toMatchObject({ attempts: 1 });
  queue.rows.clear(); // Simulate terminal-job expiry/payload scrubbing.
  for (let attempt = 2; attempt <= 5; attempt++) {
    await store.settings.set('media.cleanup.cursor.all', '');
    await cleanup.recover();
    expect(await store.settings.get(first)).toMatchObject({
      attempts: attempt,
    });
    queue.rows.clear();
    await store.settings.set('media.cleanup.cursor.all', '');
    await cleanup.recover();
    expect(queue.rows.size).toBe(0);
    store.advance();
  }
  await store.settings.set('media.cleanup.cursor.all', '');
  await cleanup.recover();
  expect(queue.rows.size).toBe(0);
  expect(await cleanup.attention()).toBe(50);
  expect(await store.settings.get(first)).not.toBeNull();
});
