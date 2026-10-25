import { expect, test } from 'bun:test';
import { DEFAULT_PERMALINK_SETTINGS } from '@cms/sdk';
import type { Database } from '#api/infra/prisma/client';
import { PrismaUserDirectory } from '#api/infra/prisma/user-directory';
import { PrismaPermalinkRepository } from '#api/infra/prisma/permalink-repository';
import { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';

test('author rename commits before slow token work and a new worker resumes its persisted intent', async () => {
  const settings = new Map<string, string>([
    [
      'permalinks',
      JSON.stringify({
        ...DEFAULT_PERMALINK_SETTINGS,
        post: '/%byline%/%slug%',
      }),
    ],
  ]);
  let transaction = false;
  let author = 'old';
  let path: Uint8Array | null = null;
  let calls = 0;
  const db = {
    $executeRaw: async () => 1,
    $transaction: async <T>(run: (tx: Database) => Promise<T>) => {
      transaction = true;
      try {
        return await run(db);
      } finally {
        transaction = false;
      }
    },
    user: {
      update: async ({ data }: { data: { slug: string } }) => {
        author = data.slug;
      },
    },
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { value: settings.get(where.key) } : null,
      create: async ({ data }: { data: { key: string; value: string } }) => {
        settings.set(data.key, data.value);
      },
      update: async ({
        where,
        data,
      }: {
        where: { key: string };
        data: { value: string };
      }) => {
        settings.set(where.key, data.value);
      },
      upsert: async ({
        where,
        update,
      }: {
        where: { key: string };
        update: { value: string };
      }) => {
        settings.set(where.key, update.value);
      },
      delete: async ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
      },
    },
    content: {
      findMany: async (query: {
        select: { type?: boolean };
        where?: { id?: { gt?: string } };
      }) => {
        if (query.where?.id?.gt === 'entry') return [];
        if (!query.select.type) return [{ id: 'entry' }];
        return [
          {
            id: 'entry',
            type: 'post',
            slug: 'hello',
            title: 'Hello',
            parentId: null,
            publishedAt: null,
            createdAt: new Date('2026-01-01'),
            currentPath: path && { path },
            author: { slug: author },
            terms: [],
          },
        ];
      },
    },
    contentPath: {
      findUnique: async () => null,
      findMany: async () => [],
      createMany: async ({ data }: { data: { path: Uint8Array }[] }) => {
        path = data[0]!.path;
      },
    },
  } as unknown as Database;
  const tokens = new PermalinkTokenRegistry(100);
  tokens.register('byline', async (values) => {
    calls++;
    expect(transaction).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transaction).toBe(false);
    return values.author!;
  });
  await new PrismaUserDirectory(db).updateProfile({
    id: 'user',
    slug: 'renamed',
    name: 'Name',
    email: 'user@example.com',
    bio: '',
    locale: '',
  });
  expect(author).toBe('renamed');
  expect(calls).toBe(0);
  expect(settings.has('permalinks.regeneration')).toBe(true);
  await new PrismaPermalinkRepository(db, tokens).resume();
  expect(calls).toBe(1);
  expect(new TextDecoder().decode(path!)).toBe('/renamed/hello');
  expect(settings.has('permalinks.regeneration')).toBe(false);
});
