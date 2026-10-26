import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { PrivacyService } from '#api/domain/privacy/privacy-service';
import { readSiteSettings } from '#api/domain/site/site-service';
import { EmailService } from '#api/domain/email/email-service';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { PrismaPrivacyRepository } from '#api/infra/prisma/privacy-repository';
import { aesSecretBox } from '#api/infra/secret-box';
import { hmacSigner } from '#api/infra/hmac-signer';
import { randomTokenIssuer } from '#api/infra/system';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { DEFAULT_RATE_RULES, DEFAULT_ENTRY_SEO } from '@cms/sdk';
import { ContentService } from '#api/domain/content/content-service';
import { ContentTypeService } from '#api/domain/content/content-types';
import { FieldService } from '#api/domain/content/fields';
import { PublishedContentReader } from '#api/domain/content/public-content';
import { RevisionService, inputOf } from '#api/domain/content/revision-service';
import { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { PrismaUserRepository } from '#api/infra/prisma/auth-repositories';
import { PrismaArchivePaths } from '#api/infra/prisma/archive-paths';
import type { Database } from '#api/infra/prisma/client';
import { PrismaCommentRepository } from '#api/infra/prisma/comment-repository';
import { PrismaContentRepository } from '#api/infra/prisma/content-repository';
import { PrismaJobQueue } from '#api/infra/prisma/job-queue';
import {
  lockPermalinks,
  PrismaPermalinkRepository,
} from '#api/infra/prisma/permalink-repository';
import { PrismaPublishedContentRepository } from '#api/infra/prisma/published-content-repository';
import { PrismaRateLimitStore } from '#api/infra/prisma/rate-limit-store';
import { PrismaRevisionRepository } from '#api/infra/prisma/revision-repository';
import { PrismaSearchSource } from '#api/infra/prisma/search-source';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';
import { PrismaSiteSettingsWriter } from '#api/infra/prisma/site-settings';
import { PrismaTaskLeases } from '#api/infra/prisma/task-leases';
import { PrismaTaxonomyRepository } from '#api/infra/prisma/taxonomy-repository';
import { tiptapRenderer, uuidV7, systemClock } from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  ADMIN,
  plainHasher,
  recordingLogger,
  userRecord,
} from '#test/support/memory';
import { scratchDatabase } from '#test/support/scratch-database';
import { textDocument } from '#test/support/content';

/**
 * Core Prisma adapters on a real MariaDB (opt in with `CMS_TEST_DATABASE_URL`, see
 * `scratchDatabase`): what in-memory adapters cannot show — transactions, raw SQL, row locks.
 */
const serverUrl = process.env.CMS_TEST_DATABASE_URL;
const SLOW = 60_000;

describe.skipIf(!serverUrl)('core Prisma adapters on MariaDB', () => {
  let db: Database;
  let drop = async () => {};

  beforeAll(async () => {
    ({ db, drop } = await scratchDatabase(serverUrl!, 'cms_core_test'));
    await new PrismaUserRepository(db).insert(
      userRecord({ id: ADMIN.id, createdAt: new Date() }),
    );
  }, SLOW);

  afterAll(() => drop(), SLOW);

  const services = (repository = new PrismaContentRepository(db)) => {
    const settings = new PrismaSettingsRepository(db);
    const types = new ContentTypeService(settings, async () => false);
    const content = new ContentService({
      repository,
      renderer: tiptapRenderer,
      hooks: new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
      ids: uuidV7,
      clock: systemClock,
      users: new PrismaUserRepository(db),

      hasher: plainHasher,
      types,
      fields: new FieldService({ settings, images: async () => new Map() }),
    });
    const revisions = new PrismaRevisionRepository(db);
    const terms = new PrismaTaxonomyRepository(db);
    const secrets = aesSecretBox('core-privacy-test');
    const jobs = new PrismaJobQueue(db, uuidV7, secrets);
    const email = new EmailService({
      settings,
      secrets,
      sealedJobs: new SealedJobs(jobs, secrets),
      mailer: { send: async () => undefined },
    });
    const privacy = new PrivacyService({
      repository: new PrismaPrivacyRepository(db, secrets),
      settings,
      published: new PrismaPublishedContentRepository(db),
      email,
      site: async () => ({
        title: 'Site',
        locale: 'en',
        siteUrl: 'https://example.com',
      }),
      signer: hmacSigner('core-privacy-test'),
      tokens: randomTokenIssuer,
      hasher: plainHasher,
      ids: uuidV7,
      clock: systemClock,
      protection: new ProtectionService({
        settings: new SecuritySettingsService(settings, secrets),
        store: new PrismaRateLimitStore(db),
        captcha: { verify: async () => false },
        clock: systemClock,
      }),
    });

    return {
      privacy,
      email,
      jobs,
      secrets,
      settings,
      repository,
      content,
      revisions,
      history: new RevisionService({
        content,
        revisions,
        renderer: tiptapRenderer,
        ids: uuidV7,
        clock: systemClock,
      }),
      terms,
      taxonomy: new TaxonomyService({
        repository: terms,
        ids: uuidV7,
        clock: systemClock,
      }),
      comments: new PrismaCommentRepository(db),
      source: new PrismaSearchSource(db),
    };
  };

  test(
    'revision mutations share the content lock, reject stale ownership and source rows, and preserve later autosaves',
    async () => {
      const { content, repository, revisions, history } = services();
      const entry = await content.create(
        { type: 'post', title: 'Original', document: textDocument('Original') },
        ADMIN,
      );
      const source = (await history.list(entry.id, ADMIN))[0]!;
      const current = await content.update(
        entry.id,
        { ...inputOf(entry), title: 'Current' },
        ADMIN,
      );
      const guard = (await repository.findById(entry.id))!;
      const other = userRecord({
        id: uuidV7.next(),
        email: 'revision-owner@example.com',
        slug: 'revision-owner',
        createdAt: new Date(),
      });
      await new PrismaUserRepository(db).insert(other);
      const entered = Promise.withResolvers<void>();
      const resume = Promise.withResolvers<void>();
      const reassignment = db.$transaction(async (tx) => {
        await lockPermalinks(tx);
        entered.resolve();
        await resume.promise;
        // User reassignment changes no updatedAt; the ownership check must catch it separately.
        await tx.content.update({
          where: { id: entry.id },
          data: { authorId: other.id },
        });
      });
      await entered.promise;
      let finished = false;
      const deletion = revisions.delete(entry.id, source.id, guard).then(
        () => {
          finished = true;
          return null;
        },
        (error: unknown) => {
          finished = true;
          return error;
        },
      );
      try {
        await Bun.sleep(50);
        expect(finished).toBe(false);
      } finally {
        resume.resolve();
      }
      await reassignment;
      expect(await deletion).toMatchObject({ code: 'conflict' });
      expect(await revisions.get(source.id)).not.toBeNull();
      await db.content.update({
        where: { id: entry.id },
        data: { authorId: ADMIN.id },
      });
      const sourceRecord = (await revisions.get(source.id))!;
      await history.delete(entry.id, source.id, ADMIN);
      // A stale restore has already read the source, but deletion wins before its locked write.
      await expect(
        content.update(
          entry.id,
          {
            ...inputOf(current),
            title: sourceRecord.title,
            document: sourceRecord.document,
            expectedUpdatedAt: current.updatedAt,
          },
          ADMIN,
          { id: source.id, authorId: ADMIN.id, status: current.status },
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect((await content.get(entry.id, ADMIN)).title).toBe('Current');
      await history.autosave(
        entry.id,
        { title: 'Newer tab', excerpt: '', document: textDocument('Unsaved') },
        ADMIN,
      );
      const clearing = Promise.withResolvers<void>();
      const complete = Promise.withResolvers<void>();
      const paused = db.$extends({
        query: {
          contentRevision: {
            deleteMany: async ({ args, query }) => {
              const result = await query(args);
              if (args.where?.kind === 'autosave') {
                clearing.resolve();
                await complete.promise;
              }
              return result;
            },
          },
        },
      }) as unknown as Database;
      const saving = services(
        new PrismaContentRepository(paused),
      ).content.update(
        entry.id,
        { ...inputOf(current), title: 'Completed save' },
        ADMIN,
      );
      await clearing.promise;
      let autosaved = false;
      const autosaving = history
        .autosave(
          entry.id,
          {
            title: 'Newer tab',
            excerpt: '',
            document: textDocument('Unsaved'),
          },
          ADMIN,
        )
        .then(() => {
          autosaved = true;
        });
      try {
        await Bun.sleep(50);
        expect(autosaved).toBe(false);
      } finally {
        complete.resolve();
      }
      const renewed = await saving;
      await autosaving;
      const later = (await revisions.findAutosave(entry.id, ADMIN.id))!;
      expect((await history.pendingAutosave(entry.id, ADMIN))?.id).toBe(
        later.id,
      );
      await expect(
        revisions.delete(
          entry.id,
          later.id,
          (await repository.findById(entry.id))!,
        ),
      ).rejects.toMatchObject({ code: 'invalid_input' });
      expect(await revisions.findAutosave(entry.id, ADMIN.id)).toEqual(later);
      // Pruning takes the same lock and also cannot invalidate the durable watermark.
      const watermark = (await repository.findById(entry.id))!.textSavedAt;
      let next = renewed;
      for (let index = 0; index < 26; index++)
        next = await content.update(
          entry.id,
          { ...inputOf(next), title: `Prune ${index}`, preserveAutosave: true },
          { ...ADMIN, id: other.id },
        );
      expect(
        (await revisions.list(entry.id)).filter(
          (row) => row.kind === 'revision',
        ),
      ).toHaveLength(25);
      expect(
        (await repository.findById(entry.id))!.textSavedAt > watermark,
      ).toBe(true);
      expect(await revisions.findAutosave(entry.id, ADMIN.id)).toEqual(later);
    },
    SLOW,
  );

  test(
    'revision persistence failures roll back content, history, covered autosaves, paths and outbox together',
    async () => {
      const { content, revisions, history } = services();
      const entry = await content.create(
        {
          type: 'post',
          title: 'Atomic original',
          document: textDocument('Original'),
        },
        ADMIN,
      );
      await history.autosave(
        entry.id,
        {
          title: 'Covered autosave',
          excerpt: '',
          document: textDocument('Unsaved'),
        },
        ADMIN,
      );
      const before = await db.content.findUniqueOrThrow({
        where: { id: entry.id },
      });
      const historyBefore = await revisions.list(entry.id);
      const pathsBefore = await db.contentPath.findMany({
        where: { contentId: entry.id },
      });
      const outboxBefore = await db.searchOutbox.count({
        where: { contentId: entry.id },
      });
      for (const stage of ['revision', 'clear'] as const) {
        const failing = db.$extends({
          query: {
            contentRevision: {
              create: async ({ args, query }) => {
                const result = await query(args);
                if (stage === 'revision')
                  throw new Error('Injected revision failure');
                return result;
              },
              deleteMany: async ({ args, query }) => {
                const result = await query(args);
                if (stage === 'clear' && args.where?.kind === 'autosave')
                  throw new Error('Injected clear failure');
                return result;
              },
            },
          },
        }) as unknown as Database;
        const failed = services(new PrismaContentRepository(failing)).content;
        await expect(
          failed.update(
            entry.id,
            {
              ...inputOf(entry),
              title: 'Must roll back',
              slug: 'atomic-failed-path',
            },
            ADMIN,
          ),
        ).rejects.toThrow('Injected');
        expect(
          await db.content.findUniqueOrThrow({ where: { id: entry.id } }),
        ).toEqual(before);
        expect(await revisions.list(entry.id)).toEqual(historyBefore);
        expect(
          await db.contentPath.findMany({ where: { contentId: entry.id } }),
        ).toEqual(pathsBefore);
        expect(
          await db.searchOutbox.count({ where: { contentId: entry.id } }),
        ).toBe(outboxBefore);
        await expect(
          failed.create(
            {
              type: 'post',
              title: 'Failed atomic create',
              slug: 'atomic-failed-create',
              document: textDocument('New'),
            },
            ADMIN,
          ),
        ).rejects.toThrow('Injected');
        expect(
          await db.content.count({ where: { slug: 'atomic-failed-create' } }),
        ).toBe(0);
      }
      // A lost response AFTER commit must leave the whole save committed; never compensate it.
      const repository = new PrismaContentRepository(db);
      const update = repository.update.bind(repository);
      repository.update = async (...args) => {
        await update(...args);
        throw new Error('Response lost after commit');
      };
      await expect(
        services(repository).content.update(
          entry.id,
          { ...inputOf(entry), title: 'Atomic committed' },
          ADMIN,
        ),
      ).rejects.toThrow('Response lost');
      const committed = await db.content.findUniqueOrThrow({
        where: { id: entry.id },
      });
      expect(committed.title).toBe('Atomic committed');
      expect(committed.textSavedAt).toEqual(committed.updatedAt);
      expect(
        (await history.list(entry.id, ADMIN)).find((row) => row.isCurrent)
          ?.title,
      ).toBe('Atomic committed');
      expect(await revisions.findAutosave(entry.id, ADMIN.id)).toBeNull();
      expect(
        await db.searchOutbox.count({ where: { contentId: entry.id } }),
      ).toBe(outboxBefore + 1);
    },
    SLOW,
  );

  test(
    'public projections keep relation metadata while hiding editorial and protected data',
    async () => {
      const { content } = services();
      const mediaId = uuidV7.next();
      await db.media.create({
        data: {
          id: mediaId,
          uploaderId: ADMIN.id,
          filename: 'projection.webp',
          mime: 'image/webp',
          size: 100,
          width: 1200,
          height: 800,
          alt: 'Alt "<&한글>',
          storageKey: `2026/04/${mediaId}.webp`,
          variants: JSON.stringify({
            thumbnail: {
              key: `2026/04/${mediaId}-thumbnail.webp`,
              width: 150,
              height: 100,
            },
          }),
          createdAt: systemClock.now(),
        },
      });
      const parent = await content.create(
        {
          type: 'page',
          title: 'Projection parent',
          status: 'private',
          document: textDocument('PRIVATE_PARENT_BODY'),
        },
        ADMIN,
      );
      const child = await content.create(
        {
          type: 'page',
          title: 'Projection child',
          slug: '한글-projection',
          status: 'published',
          parentId: parent.id,
          featuredMediaId: mediaId,
          document: textDocument('Visible child'),
          seo: { ...DEFAULT_ENTRY_SEO, focusKeyword: 'SECRET_FOCUS' },
        },
        ADMIN,
      );
      await db.content.update({
        where: { id: child.id },
        data: {
          document: 'SECRET_DOCUMENT{',
          fields: '{"secret":"SECRET_FIELD"}',
        },
      });
      const locked = await content.create(
        {
          type: 'post',
          title: 'Projection protected',
          status: 'published',
          password: 'test-password',
          document: textDocument('SECRET_BODY'),
        },
        ADMIN,
      );
      const draft = await content.create(
        {
          type: 'post',
          title: 'Projection draft',
          status: 'draft',
          document: textDocument('DRAFT_BODY'),
        },
        ADMIN,
      );
      const repository = new PrismaPublishedContentRepository(db);
      const reader = new PublishedContentReader(repository);
      const item = await reader.getById(child.id);
      expect(item).toMatchObject({
        path: child.path,
        parentId: null,
        html: '<p>Visible child</p>',
        fields: {},
        featuredImage: { alt: 'Alt "<&한글>', width: 1200 },
      });
      expect(
        item!.featuredImage!.sizes.some((size) => size.width === 150),
      ).toBe(true);
      expect(await reader.getById(parent.id)).toBeNull();
      expect(await reader.getById(draft.id)).toBeNull();
      expect((await reader.getById(locked.id))?.html).toBe('');
      expect((await repository.privateById(parent.id))?.html).toBe(
        '<p>PRIVATE_PARENT_BODY</p>',
      );
      const page = await reader.summaries({
        include: [parent.id, child.id, locked.id, draft.id],
        pageSize: 10,
      });
      expect(page.items.map(({ id }) => id).sort()).toEqual(
        [child.id, locked.id].sort(),
      );
      for (const marker of [
        'SECRET_DOCUMENT',
        'SECRET_FIELD',
        'SECRET_FOCUS',
        'SECRET_BODY',
        'PRIVATE_PARENT_BODY',
        'DRAFT_BODY',
      ])
        expect(JSON.stringify(page)).not.toContain(marker);
      for (const summary of page.items) {
        expect(summary).not.toHaveProperty('html');
        expect(summary).not.toHaveProperty('document');
        expect(summary).not.toHaveProperty('authorId');
      }
      await db.content.update({
        where: { id: parent.id },
        data: { status: 'published', passwordHash: 'protected' },
      });
      expect((await reader.getById(child.id))?.parentId).toBeNull();
      await db.content.update({
        where: { id: parent.id },
        data: { passwordHash: null, trashedAt: systemClock.now() },
      });
      expect((await reader.getById(child.id))?.parentId).toBeNull();
      expect(await repository.byId(parent.id)).toBeNull();
      await db.content.update({
        where: { id: parent.id },
        data: { trashedAt: null },
      });
      expect((await reader.getById(child.id))?.parentId).toBe(parent.id);
      await db.content.update({
        where: { id: parent.id },
        data: { status: 'private', trashedAt: systemClock.now() },
      });
      expect(await repository.privateById(parent.id)).toBeNull();
      const ids = [parent.id, child.id, locked.id, draft.id];
      await db.content.deleteMany({ where: { id: { in: ids } } });
      await db.searchOutbox.deleteMany({ where: { contentId: { in: ids } } });
      await db.media.delete({ where: { id: mediaId } });
    },
    SLOW,
  );

  test('approved comment counts follow every status change; deleting a parent keeps its replies', async () => {
    const { content, comments, repository, secrets } = services();
    const entry = await content.create(
      {
        type: 'post',
        title: 'Talk',
        status: 'published',
        document: textDocument('Hi'),
      },
      ADMIN,
    );
    const at = new Date();
    const base = {
      contentId: entry.id,
      userId: null,
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      authorUrl: '',
      authorIp: '203.0.113.9',
      authorUserAgent: 'Mozilla/5.0',
      body: 'First',
      createdAt: at,
      updatedAt: at,
    };
    await comments.insert({
      ...base,
      id: 'c1',
      parentId: null,
      status: 'approved',
    });
    await comments.insert({
      ...base,
      id: 'c2',
      parentId: 'c1',
      body: 'Reply',
      status: 'approved',
      createdAt: new Date(at.getTime() + 1000),
    });
    expect((await repository.findById(entry.id))?.commentCount).toBe(2);
    await comments.setStatus(['c2'], 'spam', new Date());
    expect((await repository.findById(entry.id))?.commentCount).toBe(1);
    await comments.setStatus(['c2'], 'approved', new Date());
    expect(
      (await comments.thread(entry.id, 1, 10, 3)).items.map(
        (item) => item.depth,
      ),
    ).toEqual([0, 1]);
    await comments.delete(['c1']);
    expect(await comments.findById('c2')).toMatchObject({ parentId: null });
    expect((await repository.findById(entry.id))?.commentCount).toBe(1);
    expect(await comments.recent(5)).toEqual([
      {
        id: 'c2',
        contentId: entry.id,
        parentId: null,
        createdAt: new Date(at.getTime() + 1000),
        author: 'Ann',
        title: 'Talk',
        path: entry.path,
      },
    ]);

    // Moderation lists filter by id and search IP addresses; erasure clears them.
    await comments.insert({
      ...base,
      id: 'c3',
      parentId: null,
      authorEmail: 'bob@example.com',
      authorIp: null,
      authorUserAgent: null,
      status: 'approved',
    });
    const listed = async (criteria: { ids?: string[]; search?: string }) =>
      (await comments.list({ ...criteria, page: 1, pageSize: 20 })).items.map(
        (item) => [item.id, item.authorIp, item.authorUserAgent],
      );
    expect(await listed({ ids: ['c2', 'missing'] })).toEqual([
      ['c2', '203.0.113.9', 'Mozilla/5.0'],
    ]);
    expect(await listed({ search: '203.0.113' })).toEqual([
      ['c2', '203.0.113.9', 'Mozilla/5.0'],
    ]);
    const privacy = new PrismaPrivacyRepository(db, secrets);
    const subject = userRecord({
      id: uuidV7.next(),
      email: 'ann@example.com',
      createdAt: new Date(),
    });
    await db.user.create({ data: subject });
    await db.content.update({
      where: { id: entry.id },
      data: {
        modifiedById: subject.id,
        createdById: ADMIN.id,
        createdIp: '192.0.2.100',
        createdUserAgent: 'Other browser',
        modifiedIp: '192.0.2.9',
        modifiedUserAgent: 'Origin browser',
      },
    });
    await db.contentRevision.updateMany({
      where: { contentId: entry.id },
      data: {
        authorId: subject.id,
        ip: '192.0.2.9',
        userAgent: 'Origin browser',
      },
    });
    expect(await privacy.data(subject.email, 'content', null, 10)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: entry.id,
          createdIp: null,
          createdUserAgent: null,
          modifiedIp: '192.0.2.9',
          modifiedUserAgent: 'Origin browser',
        }),
      ]),
    );
    expect(await privacy.data(subject.email, 'revisions', null, 10)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ip: '192.0.2.9',
          userAgent: 'Origin browser',
        }),
      ]),
    );
    expect(
      await privacy.data('ann@example.com', 'comments', null, 10),
    ).toMatchObject([
      { id: 'c2', authorIp: '203.0.113.9', authorUserAgent: 'Mozilla/5.0' },
    ]);
    await db.content.update({
      where: { id: entry.id },
      data: {
        createdById: subject.id,
        createdIp: '192.0.2.9',
        createdUserAgent: 'Origin browser',
        modifiedById: ADMIN.id,
        modifiedIp: '192.0.2.100',
        modifiedUserAgent: 'Other browser',
      },
    });
    expect(await privacy.data(subject.email, 'content', null, 10)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: entry.id,
          createdIp: '192.0.2.9',
          createdUserAgent: 'Origin browser',
          modifiedIp: null,
          modifiedUserAgent: null,
        }),
      ]),
    );
    const now = new Date();
    await privacy.insert({
      id: 'comment-erasure',
      email: 'ann@example.com',
      action: 'erase',
      status: 'confirmed',
      tokenHash: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      confirmedAt: now,
      completedAt: null,
    });
    await privacy.erase('comment-erasure', 'erased-hash', now);
    expect(
      await db.content.findUnique({ where: { id: entry.id } }),
    ).toMatchObject({
      createdIp: null,
      createdUserAgent: null,
      createdById: null,
      modifiedById: ADMIN.id,
      modifiedIp: '192.0.2.100',
      modifiedUserAgent: 'Other browser',
    });
    expect(
      await db.contentRevision.findFirst({ where: { contentId: entry.id } }),
    ).toMatchObject({
      ip: null,
      userAgent: null,
    });
    expect(await comments.findById('c2')).toMatchObject({
      authorEmail: '',
      authorIp: null,
      authorUserAgent: null,
    });
    expect(await comments.findById('c3')).toMatchObject({
      authorEmail: 'bob@example.com',
    });
  });

  test('jobs, task leases and rate limits hold under concurrent processes', async () => {
    const jobs = new PrismaJobQueue(db, uuidV7);
    for (let index = 0; index < 4; index += 1)
      await jobs.enqueue('test', { index });
    const now = new Date(Date.now() + 1000);
    const [a, b] = await Promise.all([
      jobs.claim(3, 'a', 60_000, now),
      jobs.claim(3, 'b', 60_000, now),
    ]);
    const ids = [...a, ...b].map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(4);
    const owned = a[0] ?? b[0]!;
    const owner = a.includes(owned) ? 'a' : 'b';
    expect(await jobs.complete(owned.id, 'other')).toBe(false);
    expect(await jobs.complete(owned.id, owner)).toBe(true);

    const leases = new PrismaTaskLeases(db);
    await leases.ensure('task');
    const claims = await Promise.all(
      ['x', 'y', 'z'].map((owner) =>
        leases.claim('task', owner, 60_000, new Date()),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const leaseOwner = ['x', 'y', 'z'][claims.findIndex(Boolean)]!;
    expect(await leases.release('task', 'other', new Date(), null)).toBe(false);
    expect(await leases.release('task', leaseOwner, new Date(), null)).toBe(
      true,
    );
    await db.scheduledTask.update({
      where: { name: 'task' },
      data: { nextRunAt: new Date(Date.now() + 60000) },
    });
    expect(await leases.claim('task', 'ordinary', 60000, new Date())).toBe(
      false,
    );
    const immediate = await Promise.all(
      ['a', 'b'].map((owner) =>
        leases.claim('task', owner, 60000, new Date(), { ignoreDue: true }),
      ),
    );
    expect(immediate.filter(Boolean)).toHaveLength(1);

    const limits = new PrismaRateLimitStore(db);
    const otherLimits = new PrismaRateLimitStore(db);
    const rule = { ...DEFAULT_RATE_RULES.commentClient, max: 5 };
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? limits : otherLimits).hit('ip:1', rule, now),
      ),
    );
    expect(attempts.filter((over) => !over)).toHaveLength(5);
    expect(attempts.filter(Boolean)).toHaveLength(3);
    expect(await limits.exceeded('ip:1', rule, now)).toBe(true);
    expect(await limits.exceeded('ip:2', rule, now)).toBe(false);
    const expiry = new Date(
      now.getTime() + Math.max(rule.windowSeconds, rule.blockSeconds) * 1000,
    );
    expect(
      await otherLimits.hit('ip:1', rule, new Date(expiry.getTime() - 1)),
    ).toBe(true);
    expect(await limits.hit('ip:1', rule, expiry)).toBe(false);
    expect(await otherLimits.exceeded('ip:1', rule, expiry)).toBe(false);
  });

  test('moving a page tree updates descendant paths atomically and preserves redirects', async () => {
    const { content } = services();
    const paths = new PrismaPermalinkRepository(db);
    const settings = await paths.readSettings();
    const reader = new PublishedContentReader(
      new PrismaPublishedContentRepository(db),
    );
    const resolver = new PermalinkResolver(paths, {
      getById: (id) => reader.getById(id),
    });

    try {
      await paths.saveSettings({
        ...settings,
        article: '/tree-collision/%title%',
      });
      const destination = await content.create(
        {
          type: 'page',
          title: 'Tree destination',
          slug: 'tree-destination',
          status: 'published',
          document: textDocument('Destination'),
        },
        ADMIN,
      );
      let parent = await content.create(
        {
          type: 'page',
          title: 'Tree parent',
          slug: 'tree-parent',
          status: 'published',
          document: textDocument('Parent'),
        },
        ADMIN,
      );
      const child = await content.create(
        {
          type: 'page',
          title: 'Tree leaf',
          slug: 'tree-leaf',
          parentId: parent.id,
          status: 'published',
          document: textDocument('Leaf'),
        },
        ADMIN,
      );
      expect(child.path).toBe('/tree-parent/tree-leaf');
      await content.create(
        {
          type: 'article',
          title: 'tree-leaf',
          slug: 'tree-blocker',
          status: 'published',
          document: textDocument('Blocks descendant path'),
        },
        ADMIN,
      );

      parent = await content.update(
        parent.id,
        { ...inputOf(parent), slug: 'tree-renamed' },
        ADMIN,
      );
      expect((await content.get(child.id, ADMIN)).path).toBe(
        '/tree-renamed/tree-leaf',
      );
      await expect(
        content.update(
          parent.id,
          { ...inputOf(parent), slug: 'tree-collision' },
          ADMIN,
        ),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(await content.get(parent.id, ADMIN)).toMatchObject({
        slug: 'tree-renamed',
        path: '/tree-renamed',
      });
      expect((await content.get(child.id, ADMIN)).path).toBe(
        '/tree-renamed/tree-leaf',
      );
      expect(await paths.findByPath('/tree-collision')).toBeNull();

      parent = await content.update(
        parent.id,
        { ...inputOf(parent), parentId: destination.id },
        ADMIN,
      );
      expect(parent.path).toBe('/tree-destination/tree-renamed');
      expect((await content.get(child.id, ADMIN)).path).toBe(
        '/tree-destination/tree-renamed/tree-leaf',
      );
      for (const path of ['/tree-parent/tree-leaf', '/tree-renamed/tree-leaf'])
        expect(await resolver.resolve({ path })).toMatchObject({
          content: {
            id: child.id,
            path: '/tree-destination/tree-renamed/tree-leaf',
          },
          redirect: true,
        });

      await expect(
        content.update(
          parent.id,
          { ...inputOf(parent), type: 'post', parentId: null },
          ADMIN,
        ),
      ).rejects.toMatchObject({ code: 'invalid_input' });
      expect(await content.get(parent.id, ADMIN)).toMatchObject({
        type: 'page',
        parentId: destination.id,
        path: parent.path,
      });
      expect((await content.get(child.id, ADMIN)).path).toBe(
        '/tree-destination/tree-renamed/tree-leaf',
      );
    } finally {
      await paths.saveSettings(settings);
    }
  });

  test('archive prefixes retain history and cannot collide with content in either write order', async () => {
    const { content } = services();
    const archives = new ArchivePathsService(new PrismaArchivePaths(db));
    const initial = await archives.get();
    const occupied = await content.create(
      {
        type: 'page',
        title: 'Occupied archive',
        slug: 'occupied-archive',
        document: textDocument('Parent'),
      },
      ADMIN,
    );
    const existing = await content.create(
      {
        type: 'page',
        title: 'Occupied child',
        slug: 'occupied-child',
        parentId: occupied.id,
        document: textDocument('Child'),
      },
      ADMIN,
    );

    try {
      const saved = await archives.update({
        ...initial.bases,
        category: '/reserved-terms',
      });
      expect(saved.history.category).toContain(initial.bases.category);
      expect(await new PrismaArchivePaths(db).read()).toEqual(saved);
      expect(
        await archives.resolve(`${initial.bases.category}/news`),
      ).toMatchObject({
        taxonomy: 'category',
        slug: 'news',
        path: '/reserved-terms/news',
        redirect: true,
      });
      await expect(
        archives.update({ ...saved.bases, category: '/occupied-archive' }),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(await archives.get()).toEqual(saved);
      expect((await content.get(existing.id, ADMIN)).path).toBe(
        '/occupied-archive/occupied-child',
      );

      const namespace = await content.create(
        {
          type: 'page',
          title: 'Reserved terms root',
          slug: 'reserved-terms',
          document: textDocument('Root may coexist'),
        },
        ADMIN,
      );
      await expect(
        content.create(
          {
            type: 'page',
            title: 'Reserved child',
            slug: 'reserved-child',
            parentId: namespace.id,
            document: textDocument('Refused'),
          },
          ADMIN,
        ),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(
        await db.content.findUnique({ where: { slug: 'reserved-child' } }),
      ).toBeNull();
      expect(await archives.get()).toEqual(saved);
    } finally {
      await archives.update(initial.bases);
    }
  });

  test('the public login path and a content address cannot both win', async () => {
    const { content, settings } = services();
    const writer = new PrismaSiteSettingsWriter(db);
    const original = readSiteSettings(await settings.get('site'));
    const slug = `login-${uuidV7.next()}`;
    const loginPath = `/${slug}`;

    try {
      const outcomes = await Promise.allSettled([
        writer.save({ ...original, loginPath }),
        content.create(
          {
            type: 'page',
            title: 'Login collision',
            slug,
            status: 'published',
            document: textDocument('Only one route owner may commit'),
          },
          ADMIN,
        ),
      ]);
      expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        readSiteSettings(await settings.get('site')).loginPath === loginPath &&
          (await db.content.count({ where: { slug } })) > 0,
      ).toBe(false);
    } finally {
      await db.content.deleteMany({ where: { slug } });
      await writer.save(original);
    }

    const legacySlug = `legacy-login-${uuidV7.next()}`;
    try {
      const legacy = await content.create(
        {
          type: 'page',
          title: 'Legacy login collision',
          slug: legacySlug,
          status: 'published',
          document: textDocument('Existing content stays visible'),
        },
        ADMIN,
      );
      await settings.set('site', { ...original, loginPath: legacy.path });
      expect(await writer.publicLoginPath(legacy.path)).toMatch(
        /^\/cms-login(?:-\d+)?$/,
      );
    } finally {
      await db.content.deleteMany({ where: { slug: legacySlug } });
      await writer.save(original);
    }
  });
});
