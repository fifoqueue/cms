import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Database } from '#api/infra/prisma/client';
import {
  PrismaCommentNoticeState,
  PrismaNoticeOutbox,
} from '#api/infra/prisma/comment-notices';
import { PrismaCommentRepository } from '#api/infra/prisma/comment-repository';
import { PrismaContentRepository } from '#api/infra/prisma/content-repository';
import { PrismaUserDirectory } from '#api/infra/prisma/user-directory';
import { sequentialIds } from '#test/support/memory';
import { scratchDatabase } from '#test/support/scratch-database';

const ids = sequentialIds();

/**
 * Notification adapters on a real MariaDB (opt in with `CMS_TEST_DATABASE_URL`): the migration,
 * exact endpoint identity under a case-insensitive collation, caps and concurrent counters.
 */
const serverUrl = process.env.CMS_TEST_DATABASE_URL;

describe.skipIf(!serverUrl)('comment notification adapters on MariaDB', () => {
  let db: Database;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    ({ db, drop } = await scratchDatabase(serverUrl!, 'cms_notice_test'));
    await db.user.create({
      data: {
        id: 'user-1',
        email: 'writer@example.com',
        name: 'Writer',
        passwordHash: 'x',
        slug: 'writer',
      },
    });
  }, 120_000);
  afterAll(async () => {
    await drop?.();
  });

  const at = new Date('2026-01-01T00:00:00.000Z');

  const jobs = (kind: string) => db.job.count({ where: { kind } });
  const queued = (
    kind: string,
    payload: unknown = {},
    subjects: string[] = [],
  ) => ({
    kind,
    payload,
    subjects,
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  test('concurrent fan-outs count each notice once, queue once per key, and collect atomically', async () => {
    const outbox = new PrismaNoticeOutbox(db, ids);
    const item = (index: number) => ({
      subjects: [],
      window: { key: 'email:ann@example.com', limit: 5, windowMs: 3_600_000 },
      deliver: () => [queued('test.deliver', { index })],
      collect: (windowEnd: Date) => ({
        ...queued('test.collect'),
        runAt: windowEnd,
      }),
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        outbox.dispatch(`notice:${index}`, at, { items: [item(index)] }),
      ),
    );
    expect(results).toEqual(Array(8).fill(true));
    // A retried fan-out queues nothing again.
    expect(await outbox.dispatch('notice:0', at, { items: [item(0)] })).toBe(
      false,
    );
    expect(await jobs('test.deliver')).toBe(5);
    expect(await jobs('test.collect')).toBe(1);
    // A failing collection keeps the held count for its retry.
    await expect(
      outbox.collect('email:ann@example.com', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(
      await outbox.collect('email:ann@example.com', (count) => [
        queued('test.summary', { count }),
      ]),
    ).toBe(3);
    expect(await jobs('test.summary')).toBe(1);
    expect(
      await outbox.collect('email:ann@example.com', () => [
        queued('test.summary'),
      ]),
    ).toBe(0);
  });

  const entry = (id: string) =>
    db.content.create({
      data: {
        id,
        type: 'post',
        slug: id,
        title: 'Entry',
        excerpt: '',
        document: '{}',
        html: '',
        status: 'published',
        createdAt: at,
        updatedAt: at,
        textSavedAt: at,
        authorId: 'user-1',
        searchText: '',
      },
    });

  test('a claim races unapproval cleanly: queued only while approved, released when lost', async () => {
    await entry('entry-1');
    const comments = new PrismaCommentRepository(db);
    const state = new PrismaCommentNoticeState(db, ids);
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `comment-${index}`,
      contentId: 'entry-1',
      parentId: null,
      userId: null,
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      authorUrl: '',
      authorIp: null,
      authorUserAgent: null,
      body: 'Hello',
      status: 'approved' as const,
      createdAt: at,
      updatedAt: at,
    }));
    for (const row of rows) await comments.insert(row);
    const claims = await Promise.all(
      rows.map(async (row) => {
        const [claimed, changed] = await Promise.all([
          state.claim(row, at, queued('test.notice', { id: row.id })),
          comments.setStatus([row.id], 'spam', at),
        ]);
        // The moderation write always succeeds and reports the row exactly once.
        expect(changed).toMatchObject([{ id: row.id, status: 'approved' }]);
        return claimed;
      }),
    );
    // Every successful claim queued exactly one job; every lost one queued none.
    expect(await jobs('test.notice')).toBe(claims.filter(Boolean).length);
    let again = 0;
    for (const row of rows) {
      const current = await db.comment.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(current.status).toBe('spam');
      // The fan-out finds spam and releases the claim, so a later approval announces it.
      await state.release(row.id);
      await comments.setStatus([row.id], 'approved', at);
      expect(
        await state.claim(row, at, queued('test.again', { id: row.id })),
      ).toBe(true);
      again += 1;
      expect(
        await state.claim(row, at, queued('test.again', { id: row.id })),
      ).toBe(false);
    }
    expect(await jobs('test.again')).toBe(again);
    // Release never clears an approved comment's announcement.
    expect(await state.release(rows[0]!.id)).toBe(false);
  });

  test('moderation writes always succeed while claims race them, round after round', async () => {
    await entry('entry-2');
    const comments = new PrismaCommentRepository(db);
    const state = new PrismaCommentNoticeState(db, ids);
    const row = (index: number) => ({
      id: `race-${index}`,
      contentId: 'entry-2',
      parentId: index % 2 ? `race-${index - 1}` : null,
      userId: null,
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      authorUrl: '',
      authorIp: null,
      authorUserAgent: null,
      body: 'Hello',
      status: 'approved' as const,
      createdAt: at,
      updatedAt: at,
    });
    const rows = Array.from({ length: 6 }, (_, index) => row(index));
    for (const value of rows) await comments.insert(value);
    const all = rows.map((value) => value.id);
    for (let round = 0; round < 15; round += 1) {
      // Approve everything, then race a claim per comment against bulk, single and edit writes.
      await comments.setStatus(all, 'approved', at);
      await db.comment.updateMany({
        where: { id: { in: all } },
        data: { notifiedAt: null },
      });
      const results = await Promise.all([
        ...all.map((id) =>
          state.claim(
            { id, contentId: 'entry-2' },
            at,
            queued('test.race', { id, round }),
          ),
        ),
        comments.setStatus(all.slice(0, 3), 'spam', at),
        comments.setStatus(all.slice(2), 'pending', at),
        comments.update(
          all[1]!,
          { status: 'pending', body: `Edit ${round}` },
          at,
        ),
      ]);
      const [spam, pending, edit] = results.slice(all.length) as [
        unknown[],
        unknown[],
        { before: unknown; after: { body: string } } | null,
      ];
      // Each write reports each row it changed exactly once.
      expect(spam).toHaveLength(3);
      expect(pending).toHaveLength(4);
      expect(edit?.after.body).toBe(`Edit ${round}`);
    }
    // The approved count matches the rows after every race.
    const stored = await db.content.findUniqueOrThrow({
      where: { id: 'entry-2' },
    });
    expect(stored.commentCount).toBe(
      await db.comment.count({
        where: { contentId: 'entry-2', status: 'approved' },
      }),
    );
  });

  test('moderation and claims racing entry deletion never deadlock', async () => {
    const comments = new PrismaCommentRepository(db);
    const contents = new PrismaContentRepository(db);
    const state = new PrismaCommentNoticeState(db, ids);
    for (let round = 0; round < 10; round += 1) {
      const contentId = `doomed-${round}`;
      await entry(contentId);
      const rows = Array.from({ length: 4 }, (_, index) => ({
        id: `doomed-${round}-${index}`,
        contentId,
        parentId: index ? `doomed-${round}-0` : null,
        userId: null,
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorUrl: '',
        authorIp: null,
        authorUserAgent: null,
        body: 'Hello',
        status: 'approved' as const,
        createdAt: at,
        updatedAt: at,
      }));
      for (const row of rows) await comments.insert(row);
      const all = rows.map((row) => row.id);
      // Every call settles without an error, whichever commits first.
      const results = await Promise.allSettled([
        contents.delete(contentId),
        comments.setStatus(all, 'spam', at),
        comments.setStatus(all.slice(1), 'approved', at),
        comments.update(all[2]!, { body: `Edit ${round}` }, at),
        comments.delete([all[3]!]),
        ...rows.map((row) =>
          state.claim(row, at, queued('test.doomed', { id: row.id })),
        ),
      ]);
      expect(
        results.flatMap((result) =>
          result.status === 'rejected' ? [String(result.reason)] : [],
        ),
      ).toEqual([]);
      expect(await db.content.count({ where: { id: contentId } })).toBe(0);
      expect(await db.comment.count({ where: { contentId } })).toBe(0);
    }
    // Without a race: a three-level thread goes with its entry.
    await entry('threaded');
    for (const [index, parentId] of [null, 'thread-0', 'thread-1'].entries())
      await comments.insert({
        id: `thread-${index}`,
        contentId: 'threaded',
        parentId,
        userId: null,
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorUrl: '',
        authorIp: null,
        authorUserAgent: null,
        body: 'Hello',
        status: 'approved',
        createdAt: at,
        updatedAt: at,
      });
    await contents.delete('threaded');
    expect(await db.comment.count({ where: { contentId: 'threaded' } })).toBe(
      0,
    );
  });

  test('deleting an author removes or reassigns entries with three-level threads', async () => {
    const comments = new PrismaCommentRepository(db);
    const users = new PrismaUserDirectory(db);
    const author = async (id: string) => {
      await db.user.create({
        data: {
          id,
          email: `${id}@example.com`,
          name: id,
          passwordHash: 'x',
          slug: id,
        },
      });
      for (const index of [0, 1]) {
        const contentId = `${id}-entry-${index}`;
        await db.content.create({
          data: {
            id: contentId,
            type: 'post',
            slug: contentId,
            title: 'Entry',
            excerpt: '',
            document: '{}',
            html: '',
            status: 'published',
            createdAt: at,
            updatedAt: at,
            textSavedAt: at,
            authorId: id,
            createdById: index === 0 ? id : 'user-1',
            modifiedById: index === 1 ? id : 'user-1',
            createdIp: '192.0.2.1',
            createdUserAgent: 'Creator',
            modifiedIp: '192.0.2.2',
            modifiedUserAgent: 'Modifier',
            searchText: '',
          },
        });
        await db.contentRevision.create({
          data: {
            id: `${contentId}-revision`,
            contentId,
            authorId: id,
            kind: 'revision',
            title: 'Entry',
            excerpt: '',
            document: '{}',
            createdAt: at,
            ip: '192.0.2.3',
            userAgent: 'Revision browser',
          },
        });
        for (const [depth, parentId] of [
          null,
          `${contentId}-0`,
          `${contentId}-1`,
        ].entries())
          await comments.insert({
            id: `${contentId}-${depth}`,
            contentId,
            parentId,
            // The reply in the middle is the author's own, signed in.
            userId: depth === 1 ? id : null,
            authorName: 'Ann',
            authorEmail: depth === 1 ? `${id}@example.com` : 'ann@example.com',
            authorUrl: '',
            authorIp: null,
            authorUserAgent: null,
            body: 'Hello',
            status: 'approved',
            createdAt: at,
            updatedAt: at,
          });
      }
    };

    await author('leaving');
    await users.delete('leaving', null);
    expect(await db.content.count({ where: { authorId: 'leaving' } })).toBe(0);
    expect(
      await db.comment.count({
        where: { contentId: { in: ['leaving-entry-0', 'leaving-entry-1'] } },
      }),
    ).toBe(0);

    await author('handing-over');
    await users.delete('handing-over', 'user-1');
    expect(
      await db.content.findUnique({ where: { id: 'handing-over-entry-0' } }),
    ).toMatchObject({
      createdById: null,
      createdIp: null,
      createdUserAgent: null,
      modifiedById: 'user-1',
      modifiedIp: '192.0.2.2',
      modifiedUserAgent: 'Modifier',
    });
    expect(
      await db.content.findUnique({ where: { id: 'handing-over-entry-1' } }),
    ).toMatchObject({
      createdById: 'user-1',
      createdIp: '192.0.2.1',
      createdUserAgent: 'Creator',
      modifiedById: null,
      modifiedIp: null,
      modifiedUserAgent: null,
    });
    expect(
      await db.contentRevision.findMany({
        where: { contentId: { startsWith: 'handing-over-entry-' } },
      }),
    ).toEqual([
      expect.objectContaining({ authorId: null, ip: null, userAgent: null }),
      expect.objectContaining({ authorId: null, ip: null, userAgent: null }),
    ]);
    expect(
      await db.content.count({
        where: {
          id: { startsWith: 'handing-over-entry-' },
          authorId: 'user-1',
        },
      }),
    ).toBe(2);
    // The threads stay; the author's own reply loses only its account link.
    const kept = await db.comment.findMany({
      where: { contentId: 'handing-over-entry-0' },
      orderBy: { id: 'asc' },
      select: { id: true, parentId: true, userId: true },
    });
    expect(kept).toEqual([
      { id: 'handing-over-entry-0-0', parentId: null, userId: null },
      {
        id: 'handing-over-entry-0-1',
        parentId: 'handing-over-entry-0-0',
        userId: null,
      },
      {
        id: 'handing-over-entry-0-2',
        parentId: 'handing-over-entry-0-1',
        userId: null,
      },
    ]);
    expect(await db.user.count({ where: { id: 'handing-over' } })).toBe(0);
  });
});
