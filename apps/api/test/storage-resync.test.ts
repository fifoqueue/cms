import { expect, test } from 'bun:test';
import { StorageResync } from '#api/domain/media/storage-resync';
import { MemoryJobQueue, MemoryTaskLeases } from '#test/support/memory-jobs';

test('resync is queued, single-flight, replay-safe, and rate limited after completion', async () => {
  const values = new Map<string, unknown>();
  const store = {
    get: async (key: string) => structuredClone(values.get(key)),
    set: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    list: async () => Object.fromEntries(values),
    count: async () => values.size,
  };
  let sequence = 0;
  let runs = 0;
  const queue = new MemoryJobQueue();
  const resync = new StorageResync({
    settings: store,
    transactions: { run: async (_key, task) => task(store) },
    queue,
    leases: new MemoryTaskLeases(),
    clock: { now: () => new Date('2026-01-01') },
    ids: { next: () => String(++sequence) },
    driver: async () => 'local',
    reconcile: async () => {
      runs++;
      return { scanned: 2, refreshed: 1, missing: 1, untracked: 1 };
    },
  });
  expect(await resync.status()).toBeNull();
  const state = await resync.enqueue();
  expect(await resync.enqueue()).toEqual(state);
  expect(queue.rows.size).toBe(1);
  await resync.run({ id: state.id });
  await resync.run({ id: state.id });
  expect(runs).toBe(1);
  expect(await resync.status()).toMatchObject({
    status: 'completed',
    scanned: 2,
    missing: 1,
  });
  await expect(resync.enqueue()).rejects.toThrow();
});
