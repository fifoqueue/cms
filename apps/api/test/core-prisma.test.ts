import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { DEFAULT_EMAIL_SETTINGS } from '@cms/sdk';
import { PrivacyService } from '#api/domain/privacy/privacy-service';
import { EmailService } from '#api/domain/email/email-service';
import { ProtectionService } from '#api/domain/security/protection-service';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { PrismaPrivacyRepository } from '#api/infra/prisma/privacy-repository';
import { aesSecretBox } from '#api/infra/secret-box';
import { hmacSigner } from '#api/infra/hmac-signer';
import { randomTokenIssuer } from '#api/infra/system';
import { openJob, sealJob } from '#api/domain/jobs/payload';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { default as sharp } from 'sharp';
import { DEFAULT_RATE_RULES } from '@cms/sdk';
import { PatternService } from '#api/domain/content/pattern-service';
import { PrismaPatternCatalog } from '#api/infra/prisma/pattern-catalog';
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
import { createMeilisearchEngine } from '#api/infra/meilisearch-engine';
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
  type: 'doc' as const,
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
      limits: async () => ({ uploadsPerHour: 60, freeSpaceMb: 256 }),
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
        // This adapter test supplies its own test endpoint; egress policy has a separate suite.
        engine: createMeilisearchEngine((input, init) => fetch(input, init)),
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
  test(
    'privacy confirmation signatures cannot be changed or consumed twice',
    async () => {
      const { privacy, email, secrets } = services();
      await email.update({
        ...DEFAULT_EMAIL_SETTINGS,
        enabled: true,
        host: 'smtp.example.com',
        fromEmail: 'site@example.com',
      });
      const subject = `confirm-${uuidV7.next()}@example.com`;
      const attempt = { client: subject, address: null, captchaToken: null };
      const request = await privacy.create(
        { email: subject, action: 'export' },
        ADMIN,
        attempt,
      );
      const rows = await db.job.findMany({ where: { kind: 'email.send' } });
      const message = rows
        .map(
          (row) =>
            openJob(JSON.parse(row.payload), secrets) as {
              to: string;
              text: string;
            },
        )
        .find((item) => item.to === subject)!;
      const token = decodeURIComponent(
        /token=([^\s]+)/.exec(message.text)![1]!,
      );
      expect(JSON.stringify(request)).not.toContain(token);
      await expect(
        privacy.confirm({ token: `${token}x` }, attempt),
      ).rejects.toMatchObject({ code: 'invalid_input' });
      const results = await Promise.allSettled([
        privacy.confirm({ token }, attempt),
        privacy.confirm({ token }, attempt),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        (await db.privacyRequest.findUnique({ where: { id: request.id } }))
          ?.tokenHash,
      ).toBeNull();
      await expect(privacy.confirm({ token }, attempt)).rejects.toMatchObject({
        code: 'invalid_input',
      });
    },
    SLOW,
  );

  test(
    'pattern catalogs page metadata and keep other writers drafts private',
    async () => {
      const patterns = new PatternService({
        settings: new PrismaSettingsRepository(db),
        catalog: new PrismaPatternCatalog(db),
        renderer: tiptapRenderer,
        ids: uuidV7,
        clock: systemClock,
      });
      const contributor = { id: 'contributor', role: 'contributor' };
      const secret = await patterns.create(
        {
          title: 'Catalog A private',
          status: 'draft',
          document: paragraph('Administrator secret'),
        },
        ADMIN,
      );
      const own = await patterns.create(
        {
          title: 'Catalog B own',
          status: 'draft',
          document: paragraph('My draft'),
        },
        contributor,
      );
      const shared = await patterns.create(
        { title: 'Catalog C shared', document: paragraph('x'.repeat(300_000)) },
        ADMIN,
      );
      const first = await patterns.list(
        { search: 'Catalog', pageSize: 1 },
        contributor,
      );
      expect(first.total).toBe(2);
      expect(first.items.map(({ id }) => id)).toEqual([own.id]);
      const second = await patterns.list(
        { search: 'Catalog', pageSize: 1, page: 2 },
        contributor,
      );
      expect(second.items.map(({ id }) => id)).toEqual([shared.id]);
      expect(JSON.stringify(second).length).toBeLessThan(1000);
      expect(second.items[0]).not.toHaveProperty('document');
      expect(second.items[0]).not.toHaveProperty('html');
      await expect(patterns.get(secret.id, contributor)).rejects.toMatchObject({
        code: 'not_found',
      });
      expect((await patterns.get(own.id, contributor)).document).toEqual(
        paragraph('My draft'),
      );
      expect((await patterns.get(shared.id, contributor)).document).toEqual(
        paragraph('x'.repeat(300_000)),
      );
      expect((await patterns.list({ search: 'Catalog' }, ADMIN)).total).toBe(3);
      for (const pattern of [secret, own, shared])
        await patterns.remove(pattern.id, ADMIN);
    },
    SLOW,
  );

  test(
    'personal export contains only its confirmed subject and no credentials',
    async () => {
      const { privacy, email, secrets, content, comments } = services();
      await email.update({
        ...DEFAULT_EMAIL_SETTINGS,
        enabled: true,
        host: 'smtp.example.com',
        fromEmail: 'site@example.com',
      });
      const id = uuidV7.next();
      const subject = `export-${id}@example.com`;
      await new PrismaUserRepository(db).insert(
        userRecord({
          id,
          email: subject,
          role: 'author',
          name: 'Subject',
          passwordHash: 'SECRET-HASH',
        }),
      );
      const entry = await content.create(
        {
          type: 'post',
          title: `Export ${id}`,
          status: 'published',
          authorId: id,
          document: paragraph('Own content'),
        },
        ADMIN,
      );
      const now = new Date();
      await comments.insert({
        id: uuidV7.next(),
        contentId: entry.id,
        parentId: null,
        userId: id,
        authorName: 'Subject',
        authorEmail: subject,
        authorUrl: '',
        body: 'Own comment',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      await comments.insert({
        id: uuidV7.next(),
        contentId: entry.id,
        parentId: null,
        userId: null,
        authorName: 'OTHER-PERSON',
        authorEmail: 'other-person@example.com',
        authorUrl: '',
        body: 'OTHER-PRIVATE-COMMENT',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      const tokenHash = randomTokenIssuer.digest(uuidV7.next());
      await db.apiToken.create({
        data: {
          id: uuidV7.next(),
          userId: id,
          name: 'Phone',
          tokenHash,
          createdAt: now,
        },
      });
      const attempt = { client: subject, address: null, captchaToken: null };
      const request = await privacy.create(
        { email: subject, action: 'export' },
        ADMIN,
        attempt,
      );
      await expect(privacy.export(request.id, ADMIN)).rejects.toMatchObject({
        code: 'invalid_input',
      });
      const rows = await db.job.findMany({ where: { kind: 'email.send' } });
      const message = rows
        .map(
          (row) =>
            openJob(JSON.parse(row.payload), secrets) as {
              to: string;
              text: string;
            },
        )
        .find((item) => item.to === subject)!;
      await privacy.confirm(
        { token: decodeURIComponent(/token=([^\s]+)/.exec(message.text)![1]!) },
        attempt,
      );
      await expect(
        privacy.export(request.id, { id, role: 'author' }),
      ).rejects.toMatchObject({ code: 'forbidden' });
      const json = await new Response(
        await privacy.export(request.id, ADMIN),
      ).text();
      expect(json).toContain('Own comment');
      expect(json).toContain('Own content');
      expect(json).toContain('Phone');
      for (const value of [
        'OTHER-PERSON',
        'other-person@example.com',
        'OTHER-PRIVATE-COMMENT',
        'SECRET-HASH',
        tokenHash,
        'tokenHash',
        'passwordHash',
      ])
        expect(json).not.toContain(value);
    },
    SLOW,
  );

  test(
    'privacy erasure anonymizes the subject, revokes credentials and removes queued and failed snapshots atomically',
    async () => {
      const { privacy, email, jobs, secrets, content, comments } = services();
      await email.update({
        ...DEFAULT_EMAIL_SETTINGS,
        enabled: true,
        host: 'smtp.example.com',
        fromEmail: 'site@example.com',
      });
      const id = uuidV7.next(),
        subject = `erase-${id}@example.com`,
        now = new Date();
      await new PrismaUserRepository(db).insert(
        userRecord({
          id,
          email: subject,
          role: 'author',
          name: 'Subject Name',
          bio: 'Personal biography',
        }),
      );
      const entry = await content.create(
        {
          type: 'post',
          title: `Erase ${id}`,
          status: 'published',
          authorId: id,
          document: paragraph('Preserved publication'),
        },
        ADMIN,
      );
      const mediaId = uuidV7.next(),
        identityId = uuidV7.next();
      await db.media.create({
        data: {
          id: mediaId,
          uploaderId: id,
          filename: 'personal.pdf',
          title: 'Personal title',
          description: 'Personal description',
          alt: 'Personal alt',
          caption: 'Personal caption',
          mime: 'application/pdf',
          size: 10,
          storageKey: `privacy/${mediaId}.pdf`,
          createdAt: now,
        },
      });
      await db.userIdentity.create({
        data: {
          id: identityId,
          userId: id,
          issuer: new TextEncoder().encode('https://issuer.example.com'),
          subject: new TextEncoder().encode('PRIVATE-SUBJECT'),
          createdAt: now,
        },
      });
      await db.ssoTransaction.create({
        data: {
          handleHash: randomTokenIssuer.digest(`sso:${id}`),
          userId: id,
          state: 'state',
          nonce: 'nonce',
          codeVerifier: 'verifier',
          clientKey: randomTokenIssuer.digest(id),
          expiresAt: new Date(now.getTime() + 60000),
        },
      });
      const commentId = uuidV7.next();
      await comments.insert({
        id: commentId,
        contentId: entry.id,
        parentId: null,
        userId: id,
        authorName: 'Subject Name',
        authorEmail: subject,
        authorUrl: 'https://example.com/me',
        body: 'Personal comment body',
        status: 'approved',
        createdAt: now,
        updatedAt: now,
      });
      await db.session.create({
        data: {
          tokenHash: randomTokenIssuer.digest(`session:${id}`),
          userId: id,
          expiresAt: new Date(now.getTime() + 86400000),
        },
      });
      await db.apiToken.create({
        data: {
          id: uuidV7.next(),
          userId: id,
          name: 'Token',
          tokenHash: randomTokenIssuer.digest(`api:${id}`),
          createdAt: now,
        },
      });
      await db.passwordToken.create({
        data: {
          tokenHash: randomTokenIssuer.digest(`reset:${id}`),
          userId: id,
          purpose: 'reset',
          expiresAt: new Date(now.getTime() + 3600000),
        },
      });
      await email.queue({
        to: 'moderator@example.com',
        subjects: [id, commentId, subject],
        subject: 'Moderation',
        text: 'Personal snapshot',
      });
      const failedId = uuidV7.next();
      await db.job.create({
        data: {
          id: failedId,
          kind: 'email.send',
          payload: JSON.stringify({
            to: subject,
            text: 'Legacy private snapshot',
          }),
          runAt: now,
          createdAt: now,
          failedAt: now,
        },
      });
      const attempt = { client: subject, address: null, captchaToken: null };
      const request = await privacy.create(
        { email: subject, action: 'erase' },
        ADMIN,
        attempt,
      );
      const rows = await db.job.findMany({ where: { kind: 'email.send' } });
      const message = rows
        .map(
          (row) =>
            openJob(JSON.parse(row.payload), secrets) as {
              to: string;
              text: string;
            },
        )
        .find((item) => item.to === subject && item.text.includes('token='))!;
      await privacy.confirm(
        { token: decodeURIComponent(/token=([^\s]+)/.exec(message.text)![1]!) },
        attempt,
      );
      await db.job.update({
        where: { id: failedId },
        data: { lockedUntil: new Date(Date.now() + 60000) },
      });
      await expect(privacy.erase(request.id, ADMIN)).rejects.toMatchObject({
        code: 'conflict',
      });
      expect((await db.user.findUnique({ where: { id } }))?.email).toBe(
        subject,
      );
      await db.job.update({
        where: { id: failedId },
        data: { lockedUntil: null },
      });
      await privacy.erase(request.id, ADMIN);
      expect(await db.user.findUnique({ where: { id } })).toMatchObject({
        name: 'Anonymous',
        bio: '',
        email: `erased-${id}@invalid.invalid`,
        role: 'subscriber',
      });
      expect(
        await db.comment.findUnique({ where: { id: commentId } }),
      ).toMatchObject({
        authorEmail: '',
        authorUrl: '',
        body: '',
        userId: null,
      });
      expect(await db.session.count({ where: { userId: id } })).toBe(0);
      expect(await db.apiToken.count({ where: { userId: id } })).toBe(0);
      expect(await db.passwordToken.count({ where: { userId: id } })).toBe(0);
      expect(await db.content.count({ where: { id: entry.id } })).toBe(1);
      expect(await db.userIdentity.count({ where: { userId: id } })).toBe(0);
      expect(await db.ssoTransaction.count({ where: { userId: id } })).toBe(0);
      expect(
        await db.media.findUnique({ where: { id: mediaId } }),
      ).toMatchObject({
        uploaderId: null,
        title: '',
        description: '',
        alt: '',
        caption: '',
        storageKey: `privacy/${mediaId}.pdf`,
      });
      const remaining = await db.job.findMany();
      expect(
        remaining.every(
          (row) =>
            !JSON.stringify(openJob(JSON.parse(row.payload), secrets)).includes(
              subject,
            ),
        ),
      ).toBe(true);
      const count = remaining.length;
      await jobs.enqueue(
        'email.send',
        sealJob(
          {
            to: 'moderator@example.com',
            subjects: [commentId],
            text: 'Late snapshot',
          },
          secrets,
        ),
      );
      expect(await db.job.count()).toBe(count);
    },
    SLOW,
  );
  test(
    'changing the site timezone retains stored addresses when an entry is saved later',
    async () => {
      const { settings, content } = services();
      const paths = new PrismaPermalinkRepository(db);
      const current = await paths.readSettings();
      await settings.set('reading', { timeZone: 'UTC' });
      await paths.saveSettings({
        ...current,
        post: '/dated/%year%/%month%/%day%/%slug%',
      });
      const entry = await content.create(
        {
          type: 'post',
          title: `Timezone ${uuidV7.next()}`,
          status: 'published',
          publishedAt: '2026-01-01T00:30:00.000Z',
          document: paragraph('Date boundary'),
        },
        ADMIN,
      );
      expect(entry.path).toContain('/2026/01/01/');
      await settings.set('reading', { timeZone: 'America/Los_Angeles' });
      expect((await content.get(entry.id, ADMIN)).path).toBe(entry.path);
      const saved = await content.update(
        entry.id,
        inputOf(await content.get(entry.id, ADMIN)),
        ADMIN,
      );
      expect(saved.path).toContain('/2025/12/31/');
      expect(await paths.findByPath(entry.path)).toMatchObject({
        contentId: entry.id,
        current: false,
      });
      const published = new PrismaPublishedContentRepository(db);
      expect(
        (
          await published.list({
            type: 'post',
            year: 2025,
            month: 12,
            day: 31,
            page: 1,
            pageSize: 100,
          })
        ).items.some((item) => item.id === entry.id),
      ).toBe(true);
      expect(
        (await published.monthNeighbours(['post'], 2026, 1)).previous,
      ).toEqual({ year: 2025, month: 12 });
      await settings.set('reading', { timeZone: 'UTC' });
      await paths.saveSettings(current);
    },
    SLOW,
  );
  test(
    'erasure does not declare completion while an unscoped legacy comment notice remains',
    async () => {
      const { privacy } = services();
      const id = uuidV7.next(),
        jobId = uuidV7.next(),
        now = new Date();
      await db.privacyRequest.create({
        data: {
          id,
          email: `legacy-${id}@example.com`,
          action: 'erase',
          status: 'confirmed',
          createdAt: now,
          confirmedAt: now,
          expiresAt: new Date(now.getTime() + 86400000),
        },
      });
      await db.job.create({
        data: {
          id: jobId,
          kind: 'email.send',
          payload: JSON.stringify({
            to: 'moderator@example.com',
            subject: '[Site] New comment: Post',
            text: 'An old name and comment without a link',
          }),
          runAt: now,
          createdAt: now,
          failedAt: now,
        },
      });
      await expect(privacy.erase(id, ADMIN)).rejects.toMatchObject({
        code: 'conflict',
      });
      expect(
        (await db.privacyRequest.findUnique({ where: { id } }))?.status,
      ).toBe('confirmed');
      expect(await db.job.count({ where: { id: jobId } })).toBe(1);
      await db.job.delete({ where: { id: jobId } });
    },
    SLOW,
  );

  test(
    'media used only by a nested pattern is attached and needs forced deletion',
    async () => {
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
        limits: async () => ({ uploadsPerHour: 60, freeSpaceMb: 256 }),
        maxBytes: 1024 * 1024,
      });
      const patterns = new PatternService({
        settings: new PrismaSettingsRepository(db),
        catalog: new PrismaPatternCatalog(db),
        renderer: tiptapRenderer,
        ids: uuidV7,
        clock: systemClock,
      });
      const id = uuidV7.next();
      await repository.insert({
        id,
        uploaderId: ADMIN.id,
        filename: 'pattern.webp',
        mime: 'image/webp',
        size: 1,
        width: 1,
        height: 1,
        alt: '',
        caption: '',
        storageKey: `2026/06/${id}.webp`,
        variants: {},
        createdAt: new Date(),
      });
      const input = {
        title: 'Image pattern',
        document: {
          type: 'doc',
          content: [
            {
              type: 'image',
              attrs: { src: '/media/pattern.webp', mediaId: id },
            },
          ],
        },
      };
      const inner = await patterns.create(input, ADMIN);
      const outer = await patterns.create(
        {
          title: 'Outer image pattern',
          document: {
            type: 'doc',
            content: [{ type: 'patternRef', attrs: { ref: inner.id } }],
          },
        },
        ADMIN,
      );
      const { content } = services();
      await content.create(
        {
          type: 'post',
          title: 'Pattern-only image',
          status: 'published',
          document: {
            type: 'doc',
            content: [{ type: 'patternRef', attrs: { ref: outer.id } }],
          },
        },
        ADMIN,
      );
      expect((await media.get(id, ADMIN)).usageCount).toBe(1);
      expect(
        (await media.list({ unattached: 'true' }, ADMIN)).items.map(
          (item) => item.id,
        ),
      ).not.toContain(id);
      await expect(media.remove(id, false, ADMIN)).rejects.toMatchObject({
        code: 'conflict',
      });
      await patterns.update(
        inner.id,
        { ...input, document: paragraph('No image') },
        ADMIN,
      );
      expect((await media.get(id, ADMIN)).usageCount).toBe(0);
      await patterns.update(inner.id, input, ADMIN);
      await patterns.remove(inner.id, ADMIN);
      expect(
        (await media.list({ unattached: 'true' }, ADMIN)).items.map(
          (item) => item.id,
        ),
      ).toContain(id);
      const replacement = await patterns.create(input, ADMIN);
      await media.remove(id, true, ADMIN);
      expect(await repository.exists(id)).toBe(false);
      await patterns.remove(replacement.id, ADMIN);
      await patterns.remove(outer.id, ADMIN);
    },
    SLOW,
  );
});
