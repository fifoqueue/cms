import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { default as sharp } from 'sharp';
import { DEFAULT_RATE_RULES } from '@cms/sdk';
import { ContentService } from '#api/domain/content/content-service';
import { ContentTypeService } from '#api/domain/content/content-types';
import { FieldService } from '#api/domain/content/fields';
import { PublishedContentReader } from '#api/domain/content/public-content';
import { inputOf } from '#api/domain/content/revision-service';
import { MediaService } from '#api/domain/media/media-service';
import { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import { SearchService } from '#api/domain/search/search-service';
import { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { ExportService } from '#api/domain/tools/export-service';
import { meilisearchEngine } from '#api/infra/meilisearch-engine';
import { PrismaUserRepository } from '#api/infra/prisma/auth-repositories';
import { PrismaArchivePaths } from '#api/infra/prisma/archive-paths';
import type { Database } from '#api/infra/prisma/client';
import { PrismaCommentRepository } from '#api/infra/prisma/comment-repository';
import { PrismaContentRepository } from '#api/infra/prisma/content-repository';
import { PrismaJobQueue } from '#api/infra/prisma/job-queue';
import { PrismaMediaRepository } from '#api/infra/prisma/media-repository';
import { PrismaPermalinkRepository } from '#api/infra/prisma/permalink-repository';
import { PrismaPublishedContentRepository } from '#api/infra/prisma/published-content-repository';
import { PrismaRateLimitStore } from '#api/infra/prisma/rate-limit-store';
import { PrismaRevisionRepository } from '#api/infra/prisma/revision-repository';
import { PrismaSearchSource } from '#api/infra/prisma/search-source';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';
import { PrismaTaskLeases } from '#api/infra/prisma/task-leases';
import { PrismaTaxonomyRepository } from '#api/infra/prisma/taxonomy-repository';
import { PrismaUserDirectory } from '#api/infra/prisma/user-directory';
import { sharpImages } from '#api/infra/sharp-images';
import { tiptapRenderer, uuidV7, systemClock } from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  ADMIN,
  plainHasher,
  recordingLogger,
  userRecord,
} from '#test/support/memory';
import { plainSecretBox } from '#test/support/memory-security';
import { MemoryMediaStorage } from '#test/support/memory-media';
import { scratchDatabase } from '#test/support/scratch-database';

/**
 * Core Prisma adapters on a real MariaDB (opt in with `CMS_TEST_DATABASE_URL`, see
 * `scratchDatabase`): what in-memory adapters cannot show — transactions, raw SQL, row locks.
 * With `CMS_TEST_MEILISEARCH_URL` (and `CMS_TEST_MEILISEARCH_KEY`) the search index is checked too.
 */
const serverUrl = process.env.CMS_TEST_DATABASE_URL;
const meiliUrl = process.env.CMS_TEST_MEILISEARCH_URL;
const SLOW = 60_000;

const paragraph = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

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

  const services = () => {
    const settings = new PrismaSettingsRepository(db);
    const types = new ContentTypeService(settings, async () => false);
    const repository = new PrismaContentRepository(db);
    const content = new ContentService({
      repository,
      renderer: tiptapRenderer,
      hooks: new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
      ids: uuidV7,
      clock: systemClock,
      users: new PrismaUserRepository(db),
      revisions: new PrismaRevisionRepository(db),
      hasher: plainHasher,
      types,
      fields: new FieldService({ settings, images: async () => new Map() }),
    });
    const terms = new PrismaTaxonomyRepository(db);
    return {
      settings,
      repository,
      content,
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

  test('content writes queue search updates in their transaction; documents carry category ancestors', async () => {
    const { content, taxonomy, source } = services();
    await source.acknowledge(await source.lastId());
    const news = await taxonomy.create('category', { name: 'News' });
    const local = await taxonomy.create('category', {
      name: 'Local',
      parentId: news.id,
    });
    const entry = await content.create(
      {
        type: 'post',
        title: 'Flood',
        status: 'published',
        categoryIds: [local.id],
        document: paragraph('River rising'),
      },
      ADMIN,
    );
    const publicReads = new PrismaPublishedContentRepository(db);
    expect(
      (await publicReads.summaries({ search: 'River', page: 1, pageSize: 10 }))
        .items,
    ).toMatchObject([{ id: entry.id }]);
    expect(
      (
        await publicReads.summaries({
          category: 'news',
          page: 1,
          pageSize: 10,
        })
      ).items,
    ).toMatchObject([{ id: entry.id }]);
    await content.trash(entry.id, ADMIN);
    // Admin lists honour every filter (the trash view and author included).
    const listed = (view: 'active' | 'trash') =>
      content
        .list({ view, author: 'user' }, ADMIN)
        .then((page) => page.items.map((item) => item.id));
    expect(await listed('trash')).toEqual([entry.id]);
    expect(await listed('active')).not.toContain(entry.id);
    await content.restore(entry.id, ADMIN);
    expect((await source.pending(10)).map((row) => row.contentId)).toEqual([
      entry.id,
      entry.id,
      entry.id,
    ]);
    const [document] = await source.documents([entry.id]);
    expect(document).toMatchObject({
      title: 'Flood',
      text: 'River rising',
      categories: ['local', 'news'],
    });
    // Renaming a term can change what filters match: a full rebuild is queued.
    await taxonomy.update('category', news.id, {
      name: 'World',
      slug: 'world',
    });
    expect((await source.pending(10)).at(-1)?.contentId).toBeNull();
    await content.remove(entry.id, ADMIN).catch(async () => {
      await content.trash(entry.id, ADMIN);
      await content.remove(entry.id, ADMIN);
    });
    expect(await source.documents([entry.id])).toEqual([]);
    expect((await source.pending(10)).at(-1)?.contentId).toBe(entry.id);
  });

  test('approved comment counts follow every status change; deleting a parent keeps its replies', async () => {
    const { content, comments, repository } = services();
    const entry = await content.create(
      {
        type: 'post',
        title: 'Talk',
        status: 'published',
        document: paragraph('Hi'),
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
      { author: 'Ann', title: 'Talk', path: entry.path },
    ]);
  });

  test('monthly archive counts group public posts by UTC month', async () => {
    const { content } = services();
    await content.create(
      {
        type: 'post',
        title: 'Old',
        status: 'published',
        publishedAt: '2020-02-29T23:30:00.000Z',
        document: paragraph('x'),
      },
      ADMIN,
    );
    const months = await new PrismaPublishedContentRepository(db).months(
      ['post'],
      100,
    );
    expect(months).toContainEqual({ year: 2020, month: 2, count: 1 });
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

    const limits = new PrismaRateLimitStore(db);
    const rule = { ...DEFAULT_RATE_RULES.commentClient, max: 5 };
    await Promise.all(
      Array.from({ length: 5 }, () => limits.hit('ip:1', rule, new Date())),
    );
    expect(await limits.exceeded('ip:1', rule, new Date())).toBe(true);
    expect(await limits.exceeded('ip:2', rule, new Date())).toBe(false);
  });

  test('deleting an author with their content queues a rebuild, and export reads every table', async () => {
    const { content, source, terms, comments } = services();
    await new PrismaUserRepository(db).insert(
      userRecord({ id: 'writer', role: 'author', createdAt: new Date() }),
    );
    await content.create(
      {
        type: 'post',
        title: 'By writer',
        authorId: 'writer',
        document: paragraph('w'),
      },
      ADMIN,
    );
    const directory = new PrismaUserDirectory(db);
    const xml = await new ExportService({
      content: new PrismaContentRepository(db),
      terms,
      comments,
      users: directory,
      site: async () => ({ title: 'Site', siteUrl: 'https://example.com' }),
    }).exportWxr(ADMIN);
    expect(xml).toContain('<title><![CDATA[By writer]]></title>');
    expect(xml).toContain(
      '<wp:comment_content><![CDATA[Reply]]></wp:comment_content>',
    );

    await source.acknowledge(await source.lastId());
    await directory.delete('writer', null);
    expect(await source.pending(10)).toEqual([
      expect.objectContaining({ contentId: null }),
    ]);
  });

  test('image uploads persist writable media fields and load derived uploader data', async () => {
    const repository = new PrismaMediaRepository(db);
    const storage = new MemoryMediaStorage();
    const media = new MediaService({
      repository,
      storage,
      images: sharpImages,
      ids: uuidV7,
      clock: systemClock,
      hooks: new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
      limiter: new PrismaRateLimitStore(db),
      maxBytes: 1024 * 1024,
    });
    const png = await sharp({
      create: { width: 100, height: 80, channels: 3, background: '#abcdef' },
    })
      .png()
      .toBuffer();

    const uploaded = await media.upload(png, 'upload.png', ADMIN);

    expect(uploaded).toMatchObject({
      mime: 'image/png',
      width: 100,
      height: 80,
      uploaderId: ADMIN.id,
      uploaderName: ADMIN.id,
      usageCount: 0,
    });
    const stored = await repository.get(uploaded.id);
    expect(stored).toMatchObject({
      id: uploaded.id,
      filename: 'upload.png',
      width: 100,
      height: 80,
    });
    expect(storage.files.has(stored!.storageKey)).toBe(true);
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
          document: paragraph('Destination'),
        },
        ADMIN,
      );
      let parent = await content.create(
        {
          type: 'page',
          title: 'Tree parent',
          slug: 'tree-parent',
          status: 'published',
          document: paragraph('Parent'),
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
          document: paragraph('Leaf'),
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
          document: paragraph('Blocks descendant path'),
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
        document: paragraph('Parent'),
      },
      ADMIN,
    );
    const existing = await content.create(
      {
        type: 'page',
        title: 'Occupied child',
        slug: 'occupied-child',
        parentId: occupied.id,
        document: paragraph('Child'),
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
          document: paragraph('Root may coexist'),
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
            document: paragraph('Refused'),
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

  test.skipIf(!meiliUrl)(
    'the search index serves public results only after it caught up',
    async () => {
      const { settings, content, source } = services();
      const search = new SearchService({
        settings,
        secrets: plainSecretBox,
        engine: meilisearchEngine,
        source,
        clock: systemClock,
        logger: recordingLogger().logger,
      });
      await search.update({
        enabled: true,
        host: meiliUrl,
        indexPrefix: `cms_test_${crypto.randomUUID().slice(0, 8)}`,
        apiKey: process.env.CMS_TEST_MEILISEARCH_KEY ?? '',
      });
      const query = { text: 'aurora', page: 1, pageSize: 10 };
      const entry = await content.create(
        {
          type: 'post',
          title: 'Aurora tonight',
          status: 'published',
          document: paragraph('Lights'),
        },
        ADMIN,
      );
      expect(await search.find(query)).toBeNull();
      await search.sync();
      expect(await search.find(query)).toEqual({ ids: [entry.id], total: 1 });

      await content.trash(entry.id, ADMIN);
      expect(await search.find(query)).toBeNull();
      await search.sync();
      expect(await search.find(query)).toEqual({ ids: [], total: 0 });
    },
    SLOW,
  );
});
