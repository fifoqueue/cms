import { expect, test } from 'bun:test';
import { regeneratePaths } from '#api/domain/permalinks/regeneration';
import { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';

test('slow resolvers run outside commits in bounded resumable batches', async () => {
  const tokens = new PermalinkTokenRegistry(100);
  tokens.register('slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return 'resolved';
  });
  let cursor = 0;
  let interrupted = false;
  let resolving = 0;
  const committed: number[] = [];
  const progress: number[] = [];
  const port = {
    load: async () =>
      Array.from(
        { length: Math.min(200, 401 - cursor) },
        (_, index) => cursor + index + 1,
      ),
    resolve: async (id: number) => {
      resolving++;
      const value = await tokens.resolve('slow', {
        id: String(id),
        slug: 'entry',
        title: 'Entry',
        publishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      resolving--;
      return value;
    },
    commit: async (items: number[], results: string[]) => {
      expect(resolving).toBe(0);
      expect(items.length).toBeLessThanOrEqual(200);
      expect(results.every((value) => value === 'resolved')).toBe(true);
      if (cursor === 200 && !interrupted) {
        interrupted = true;
        throw new Error('interrupted');
      }
      committed.push(...items);
      cursor = items[items.length - 1]!;
    },
    progress: (count: number) => {
      progress.push(count);
    },
  };
  await expect(regeneratePaths(port, 500)).rejects.toThrow('interrupted');
  expect(cursor).toBe(200);
  await regeneratePaths(port, 500);
  expect(committed).toEqual(
    Array.from({ length: 401 }, (_, index) => index + 1),
  );
  expect(progress).toEqual([200, 200, 1]);
});

test('aggregate budget expiry does not commit a batch or advance progress', async () => {
  let commits = 0;
  await expect(
    regeneratePaths(
      {
        load: async () => [1],
        resolve: async () => new Promise<never>(() => {}),
        commit: async () => {
          commits++;
        },
        progress: () => {
          throw new Error('unexpected progress');
        },
      },
      5,
    ),
  ).rejects.toThrow('Timed out');
  expect(commits).toBe(0);
});
