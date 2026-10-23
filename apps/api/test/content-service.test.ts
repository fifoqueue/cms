import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_ENTRY_SEO,
  DEFAULT_PERMALINK_SETTINGS,
  toPublicEntrySeo,
} from '@cms/sdk';
import type { ContentInput } from '@cms/sdk';
import { ContentService } from '#api/domain/content/content-service';
import { checkContentParent } from '#api/domain/content/hierarchy';
import { MenuService } from '#api/domain/appearance/menu-service';
import {
  PublicContentService,
  PublishedContentReader,
} from '#api/domain/content/public-content';
import { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { PermalinkService } from '#api/domain/permalinks/permalink-service';
import { PreviewService } from '#api/domain/content/preview-service';
import { RevisionService } from '#api/domain/content/revision-service';
import { ContentTypeService } from '#api/domain/content/content-types';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import type { Database } from '#api/infra/prisma/client';
import { PrismaPublishedContentRepository } from '#api/infra/prisma/published-content-repository';
import { toSeoColumns } from '#api/infra/prisma/seo-mapper';
import { tiptapRenderer } from '#api/infra/system';
import { SiteService } from '#api/domain/site/site-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import { SlotService } from '#api/plugin-runtime/slot-service';
import type { DomainError } from '#api/shared/errors';
import {
  ADMIN,
  MemorySettings,
  testFields,
  testTypes,
  plainHasher,
  plainSigner,
  testLocks,
  MemoryContentRepository,
  fixedClock,
  recordingLogger,
  sequentialIds,
  noUsers,
} from '#test/support/memory';
import { MemoryRevisionRepository } from '#test/support/memory-revisions';
import { Embeds, vimeo, youtube } from '#api/domain/content/embeds';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { MemorySeoSettingsRepository } from '#test/support/memory-seo';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';

test('page parent rejects moving a page beneath its own descendant', async () => {
  const child = { id: 'child', type: 'page', parentId: 'root' };

  await expect(
    checkContentParent(
      { id: 'root', type: 'page', parentId: child.id },
      async (id) => (id === child.id ? child : null),
    ),
  ).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [{ path: 'parentId' }],
  });
});

const setup = () => {
  const repository = new MemoryContentRepository();
  const ids = sequentialIds();
  const taxonomy = new TaxonomyService({
    repository: new MemoryTaxonomyRepository(repository),
    ids,
    clock: fixedClock(),
  });
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const events: string[] = [];
  const listener = hooks.registrar('listener');
  for (const name of [
    'content.created',
    'content.updated',
    'content.published',
    'content.deleted',
  ] as const) {
    listener.on(name, (entry) => void events.push(`${name}:${entry.slug}`));
  }
  const clock = fixedClock();
  const revisions = new MemoryRevisionRepository();
  const service = new ContentService({
    repository,
    renderer: tiptapRenderer,
    hooks,
    ids,
    clock,
    users: noUsers,
    revisions,
    hasher: plainHasher,
    types: testTypes(),
    fields: testFields(),
  });
  const published = new MemoryPublishedContentRepository(repository);
  const protectedActions: string[] = [];
  const publicContent = new PublicContentService(
    new PublishedContentReader(published),
    hooks,
    testLocks(published, {
      check: async (attempt) => void protectedActions.push(attempt.action),
    }),
    new Embeds(() => [youtube, vimeo]),
    testFields(),
    testTypes(),
  );
  return {
    service,
    publicContent,
    taxonomy,
    hooks,
    events,
    clock,
    repository,
    revisions,
    protectedActions,
  };
};

const input = (overrides: Partial<ContentInput> = {}): ContentInput => ({
  type: 'post',
  title: 'Hello World',
  document: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
  },
  ...overrides,
});

const codeOf = async (promise: Promise<unknown>) =>
  ((await promise.catch((error: unknown) => error)) as DomainError).code;

describe('ContentService', () => {
  test('creates drafts with generated, unique slugs and rendered HTML', async () => {
    const { service } = setup();
    const first = await service.create(input(), ADMIN);
    const second = await service.create(input(), ADMIN);
    expect(first).toMatchObject({
      slug: 'hello-world',
      path: '/hello-world',
      status: 'draft',
      publishedAt: null,
      html: '<p>Body</p>',
      seo: DEFAULT_ENTRY_SEO,
    });
    expect(second.slug).toBe('hello-world-2');
  });

  test('Unicode slugs keep their encoded permalink identity', async () => {
    const { service, publicContent, repository } = setup();
    const entry = await service.create(
      input({ title: '안녕하세요', status: 'published' }),
      ADMIN,
    );
    expect(entry.slug).toBe('안녕하세요');
    expect(entry.path).toBe(`/${encodeURIComponent('안녕하세요')}`);
    const resolver = new PermalinkResolver(
      repository.permalinks,
      publicContent,
    );
    expect((await resolver.resolve({ path: entry.path })).content.id).toBe(
      entry.id,
    );
    expect((await service.create(input({ title: '🌧️' }), ADMIN)).slug).toMatch(
      /^post-[0-9a-f]+$/,
    );
  });

  test('private site reads require resolved capabilities and never expose drafts or admin fields', async () => {
    const { service, publicContent, repository } = setup();
    const entry = await service.create(input({ status: 'private' }), ADMIN);
    const resolver = new PermalinkResolver(
      repository.permalinks,
      publicContent,
    );
    expect(await codeOf(resolver.resolve({ path: entry.path }))).toBe(
      'not_found',
    );
    expect(
      await codeOf(
        resolver.resolve({ path: entry.path }, [], {
          id: 'reader',
          role: 'subscriber',
        }),
      ),
    ).toBe('not_found');
    const resolved = await resolver.resolve({ path: entry.path }, [], {
      id: 'editor',
      role: 'custom',
      capabilities: ['content.readPrivate'],
    });
    expect(resolved.content.html).toContain('Body');
    expect(resolved.content.seo.noIndex).toBe(true);
    for (const key of ['document', 'authorId', 'status', 'passwordHash'])
      expect(resolved.content).not.toHaveProperty(key);
    expect((await publicContent.list({})).items).toEqual([]);
    await service.update(entry.id, input({ status: 'draft' }), ADMIN);
    expect(
      await codeOf(resolver.resolve({ path: entry.path }, [], ADMIN)),
    ).toBe('not_found');
  });

  test('rejects taken slugs, invalid input and documents outside the schema', async () => {
    const { service } = setup();
    await service.create(input({ slug: 'taken' }), ADMIN);
    expect(await codeOf(service.create(input({ slug: 'taken' }), ADMIN))).toBe(
      'conflict',
    );
    expect(await codeOf(service.create({ title: '' }, ADMIN))).toBe(
      'invalid_input',
    );
    const iframe = { type: 'doc' as const, content: [{ type: 'iframe' }] };
    expect(
      await codeOf(service.create(input({ document: iframe }), ADMIN)),
    ).toBe('invalid_input');
  });

  test('publishing sets publishedAt once and emits events', async () => {
    const { service, events, clock } = setup();
    const seo = {
      ...DEFAULT_ENTRY_SEO,
      title: 'Published headline',
      focusKeyword: 'PRIVATE_FOCUS_SENTINEL',
    };
    const draft = await service.create(input({ seo }), ADMIN);
    clock.set('2026-02-01T00:00:00.000Z');
    const published = await service.update(
      draft.id,
      input({ status: 'published' }),
      ADMIN,
    );
    clock.set('2026-03-01T00:00:00.000Z');
    const edited = await service.update(
      draft.id,
      input({ status: 'published', title: 'Edited' }),
      ADMIN,
    );
    await service.remove(draft.id, ADMIN);
    await Bun.sleep(5);

    expect(published.publishedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(edited.publishedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(edited.slug).toBe('hello-world');
    expect(published.seo).toEqual(seo);
    expect(edited.seo).toEqual(seo);
    expect(events).toEqual([
      'content.created:hello-world',
      'content.updated:hello-world',
      'content.published:hello-world',
      'content.updated:hello-world',
      'content.deleted:hello-world',
    ]);
  });

  test('plugins can transform content before saving, but not break it', async () => {
    const { service, hooks } = setup();
    const plugin = hooks.registrar('plugin');
    plugin.filter('content.beforeSave', (data) => ({
      ...data,
      excerpt: 'auto excerpt',
    }));
    plugin.filter('content.beforeSave', (data) => ({ ...data, title: '' }));
    const entry = await service.create(input(), ADMIN);
    expect(entry).toMatchObject({
      title: 'Hello World',
      excerpt: 'auto excerpt',
    });
  });

  test("roles bound publishing and editing other users' entries", async () => {
    const { service } = setup();
    const contributor = { id: 'c', role: 'contributor' };
    const author = { id: 'a', role: 'author' };
    const editor = { id: 'e', role: 'editor' };

    expect(
      await codeOf(service.create(input({ status: 'published' }), contributor)),
    ).toBe('forbidden');
    const draft = await service.create(input(), contributor);
    const published = await service.create(
      input({ title: 'Live', status: 'published' }),
      author,
    );

    // Authors cannot touch someone else's entry; editors can.
    expect(await codeOf(service.get(draft.id, author))).toBe('forbidden');
    expect((await service.update(draft.id, input(), editor)).id).toBe(draft.id);
    // Contributors cannot publish even their own entry, nor delete published ones.
    expect(
      await codeOf(
        service.update(draft.id, input({ status: 'published' }), contributor),
      ),
    ).toBe('forbidden');
    expect(await codeOf(service.remove(published.id, contributor))).toBe(
      'forbidden',
    );
    expect(
      await codeOf(
        service.update(published.id, input({ authorId: 'c' }), author),
      ),
    ).toBe('forbidden');
  });

  test('trash and schedules decide what is public', async () => {
    const { service, publicContent, clock, events } = setup();
    const live = await service.create(input({ status: 'published' }), ADMIN);
    const later = await service.create(
      input({
        title: 'Later',
        status: 'scheduled',
        publishedAt: '2026-01-02T00:00:00.000Z',
      }),
      ADMIN,
    );
    const slugs = async () =>
      (await publicContent.list({})).items.map((item) => item.slug);

    expect(later.status).toBe('scheduled');
    expect(await slugs()).toEqual(['hello-world']);

    await service.trash(live.id, ADMIN);
    expect(await slugs()).toEqual([]);
    expect(await codeOf(publicContent.getBySlug('hello-world'))).toBe(
      'not_found',
    );
    await service.restore(live.id, ADMIN);
    expect(await slugs()).toEqual(['hello-world']);

    clock.set('2026-01-02T00:00:00.000Z');
    await service.publishDue();
    expect(await slugs()).toEqual(['later', 'hello-world']);
    expect(events).toContain('content.published:later');

    await service.trash(live.id, ADMIN);
    clock.set('2026-02-15T00:00:00.000Z');
    await service.emptyTrash(30);
    expect(await codeOf(service.get(live.id, ADMIN))).toBe('not_found');
    expect((await service.get(later.id, ADMIN)).status).toBe('published');
  });

  test('a protected body stays hidden, unsearchable and unlockable only with its current password', async () => {
    const { service, publicContent, protectedActions } = setup();
    const entry = await service.create(
      input({ status: 'published', password: 'open-sesame' }),
      ADMIN,
    );

    const locked = await publicContent.getBySlug('hello-world');
    expect(locked).toMatchObject({ protected: true, html: '', excerpt: '' });
    expect((await publicContent.list({ search: 'Body' })).total).toBe(0);
    expect(
      await codeOf(publicContent.unlock(entry.id, { password: 'no' })),
    ).toBe('invalid_input');
    expect(protectedActions).toEqual(['contentUnlock']);

    const { token } = await publicContent.unlock(entry.id, {
      password: 'open-sesame',
    });
    const proof = `${entry.id}.${token}`;
    expect(
      (await publicContent.getBySlug('hello-world', [proof])).html,
    ).toContain('Body');
    // Proofs are bound to the entry: another entry's id never matches.
    expect(
      (await publicContent.getBySlug('hello-world', [`other.${token}`])).html,
    ).toBe('');

    await service.update(
      entry.id,
      input({ status: 'published', password: 'changed' }),
      ADMIN,
    );
    expect((await publicContent.getBySlug('hello-world', [proof])).html).toBe(
      '',
    );
  });

  test('rejects a document deeper than the content budget', async () => {
    const { service } = setup();
    let node: Record<string, unknown> = { type: 'paragraph' };
    for (let depth = 0; depth < 101; depth += 1)
      node = { type: 'blockquote', content: [node] };

    expect(
      await codeOf(
        service.create(
          input({ document: { type: 'doc', content: [node] } }),
          ADMIN,
        ),
      ),
    ).toBe('invalid_input');
  });

  test('saves keep revisions, restores copy only the text, and previews show the autosave', async () => {
    const { service, revisions, clock } = setup();
    const history = new RevisionService({
      content: service,
      revisions,
      renderer: tiptapRenderer,
      ids: sequentialIds(),
      clock,
    });
    const previews = new PreviewService({
      content: service,
      revisions,
      renderer: tiptapRenderer,
      signer: plainSigner,
      clock,
      embeds: new Embeds(() => []),
      fields: testFields(),
    });
    const entry = await service.create(input({ title: 'First' }), ADMIN);
    clock.set('2026-01-01T00:01:00.000Z');
    await service.update(
      entry.id,
      input({ title: 'Second', status: 'published' }),
      ADMIN,
    );

    const listed = await history.list(entry.id, ADMIN);
    expect(listed.map((revision) => revision.title)).toEqual([
      'Second',
      'First',
    ]);
    const restored = await history.restore(entry.id, listed[1]!.id, ADMIN);
    expect(restored).toMatchObject({ title: 'First', status: 'published' });

    clock.set('2026-01-01T00:02:00.000Z');
    await history.autosave(
      entry.id,
      { title: 'Draft idea', excerpt: '', document: input().document },
      ADMIN,
    );
    expect((await history.pendingAutosave(entry.id, ADMIN))?.title).toBe(
      'Draft idea',
    );
    const { token } = await previews.create(entry.id, ADMIN);
    expect((await previews.render(token)).title).toBe('Draft idea');
    expect(await codeOf(previews.render(`${token}x`))).toBe('not_found');
    clock.set('2026-01-01T02:00:00.000Z');
    expect(await codeOf(previews.render(token))).toBe('not_found');
  });

  test('the public API serves published content only', async () => {
    const { service, publicContent, repository } = setup();
    const draft = await service.create(input({ title: 'Draft' }), ADMIN);
    const live = await service.create(
      input({ title: 'Live', status: 'published' }),
      ADMIN,
    );
    const listed = (await publicContent.list({})).items;
    expect(listed.map((item) => item.slug)).toEqual(['live']);
    const year = new Date(live.publishedAt!).getUTCFullYear();
    expect((await publicContent.list({ year })).total).toBe(1);
    expect((await publicContent.list({ year: year - 1 })).total).toBe(0);
    // Menus never reveal unpublished targets.
    const menus = new MenuService({
      settings: new MemorySettings(),
      published: new MemoryPublishedContentRepository(repository),
      terms: { list: async () => [] },
    });
    await menus.update(
      {
        menus: [
          {
            id: 'm',
            name: 'Main',
            items: [
              { id: '1', kind: 'content', contentId: draft.id },
              { id: '2', kind: 'content', contentId: live.id },
            ],
          },
        ],
        locations: { primary: 'm' },
      },
      ADMIN,
    );
    expect(await menus.publicMenu('primary')).toEqual([
      { label: 'Live', url: '/live', newTab: false, children: [] },
    ]);
    expect(await codeOf(publicContent.getBySlug('draft'))).toBe('not_found');
    // Lists never carry bodies or editor documents; single reads do.
    expect(listed[0]).not.toHaveProperty('html');
    expect((await publicContent.getBySlug('live')).html).toBeString();
    for (const item of (await service.list({}, ADMIN)).items) {
      expect(item).not.toHaveProperty('document');
      expect(item).not.toHaveProperty('html');
    }
  });

  test('slots requested by path get the content at its current path only', async () => {
    const { service, hooks, repository } = setup();
    const entry = await service.create(input({ status: 'published' }), ADMIN);
    const registry = new SlotRegistry({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    registry
      .registrar('probe')
      .provide('content.before', ({ content }) => content?.title ?? '');
    const slots = new SlotService({
      registry,
      site: new SiteService(new MemorySeoSettingsRepository(), hooks),
      content: new PublishedContentReader(
        new MemoryPublishedContentRepository(repository),
      ),
      paths: repository.permalinks,
    });
    const before = async (path: string) =>
      (await slots.render({ path }))['content.before'];

    expect(await before(entry.path)).toEqual(['Hello World']);
    expect(await before('/')).toEqual([]);
  });

  test('legacy root slugs stay published and editable after adding archives and search', async () => {
    const { service, publicContent, repository } = setup();
    for (const slug of ['category', 'tag', 'search']) {
      const entry = await service.create(
        input({ slug, title: slug, status: 'published' }),
        ADMIN,
      );
      await service.update(
        entry.id,
        input({ slug, title: `Updated ${slug}`, status: 'published' }),
        ADMIN,
      );
      expect((await publicContent.getBySlug(slug)).title).toBe(
        `Updated ${slug}`,
      );
    }
    // Equivalent to the migration's backfill for a formerly allowed /api slug.
    const legacy = await service.create(
      input({ slug: 'legacy-api', status: 'published' }),
      ADMIN,
    );
    repository.rows.get(legacy.id)!.slug = 'api';
    repository.permalinks.remove(legacy.id);
    repository.permalinks.paths.set('/api', {
      path: '/api',
      contentId: legacy.id,
      current: true,
    });
    const updated = await service.update(
      legacy.id,
      input({ status: 'published', title: 'Legacy API' }),
      ADMIN,
    );
    expect(updated.path).toBe('/api');
    expect((await publicContent.getBySlug('api')).path).toBe('/api');
  });

  test('content and permalink changes are atomic and retain previously public URLs', async () => {
    const { service, publicContent, repository, hooks, clock } = setup();
    const settings = new PermalinkService(repository.permalinks);
    const resolver = new PermalinkResolver(
      repository.permalinks,
      publicContent,
    );
    const dates = {
      ...DEFAULT_PERMALINK_SETTINGS,
      post: '/p/%year%%month%%date%',
    };
    await settings.update(dates);
    const first = await service.create(input({ status: 'published' }), ADMIN);
    expect(first.path).toBe('/p/20260101');
    expect(
      await codeOf(
        service.create(input({ title: 'Other', status: 'published' }), ADMIN),
      ),
    ).toBe('conflict');
    expect((await service.list({}, ADMIN)).total).toBe(1);

    const titles = { ...DEFAULT_PERMALINK_SETTINGS, post: '/post/%title%' };
    await settings.update(titles);
    hooks.registrar('display').filter('content.public', (value) => ({
      ...value,
      title: 'Filtered title',
    }));
    expect((await publicContent.getById(first.id))?.path).toBe(
      '/post/Hello%20World',
    );
    const second = await service.create(
      input({ title: 'Other', status: 'published' }),
      ADMIN,
    );
    expect(
      await codeOf(
        service.update(
          second.id,
          input({ title: 'Hello World', status: 'published' }),
          ADMIN,
        ),
      ),
    ).toBe('conflict');
    expect(await service.get(second.id, ADMIN)).toMatchObject({
      title: 'Other',
      path: '/post/Other',
    });
    expect(await codeOf(settings.update(dates))).toBe('conflict');
    expect(await settings.get()).toEqual(titles);
    expect((await service.get(first.id, ADMIN)).path).toBe(
      '/post/Hello%20World',
    );

    const changed = await service.update(
      first.id,
      input({ title: 'Changed', status: 'published' }),
      ADMIN,
    );
    const redirect = await resolver.resolve({ path: '/p/20260101' });
    expect(redirect.redirect).toBe(true);
    expect(redirect.content.path).toBe('/post/Changed');
    expect(redirect.content.title).toBe('Filtered title');
    const draft = await service.update(
      first.id,
      input({ title: 'Changed' }),
      ADMIN,
    );
    expect(draft.publishedAt).toBe(first.publishedAt);
    expect(await publicContent.getById(first.id)).toBeNull();
    expect(await codeOf(resolver.resolve({ path: first.path }))).toBe(
      'not_found',
    );

    // Settings changes must retain links even while previously published content is a draft.
    await settings.update({ ...titles, post: '/story/%slug%' });
    clock.set('2026-02-01T00:00:00.000Z');
    const republished = await service.update(
      first.id,
      input({ title: 'Changed', status: 'published' }),
      ADMIN,
    );
    expect(republished.publishedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(republished.path).toBe('/story/hello-world');
    expect((await resolver.resolve({ path: changed.path })).content.path).toBe(
      republished.path,
    );
    await service.remove(first.id, ADMIN);
    expect(await repository.permalinks.findByPath(first.path)).toBeNull();
    expect(await repository.permalinks.findByPath(republished.path)).toBeNull();
  });
});

const doc = (...texts: string[]): ContentInput['document'] => ({
  type: 'doc',
  content: texts.map((text) => ({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Intro ' },
      { type: 'text', text, marks: [{ type: 'bold' }] },
    ],
  })),
});

describe('content taxonomy and search', () => {
  const seed = async () => {
    const context = setup();
    const { taxonomy } = context;
    const news = await taxonomy.create('category', { name: 'News' });
    const local = await taxonomy.create('category', {
      name: 'Local',
      parentId: news.id,
    });
    const other = await taxonomy.create('category', { name: 'Other' });
    const hot = await taxonomy.create('tag', { name: 'Hot' });
    return { ...context, news, local, other, hot };
  };

  test('assigns categories and tags, rejecting unknown or wrong-kind ids', async () => {
    const { service, news, hot } = await seed();
    const entry = await service.create(
      input({ categoryIds: [news.id, news.id], tagIds: [hot.id] }),
      ADMIN,
    );
    expect(entry.categories).toEqual([
      { id: news.id, name: 'News', slug: 'news' },
    ]);
    expect(entry.tags).toEqual([{ id: hot.id, name: 'Hot', slug: 'hot' }]);
    expect((await service.update(entry.id, input(), ADMIN)).categories).toEqual(
      [],
    );

    for (const bad of [
      { categoryIds: [hot.id] },
      { tagIds: [news.id] },
      { categoryIds: ['missing'] },
    ])
      expect(await codeOf(service.create(input(bad), ADMIN))).toBe(
        'invalid_input',
      );
  });

  test('searches title, excerpt and plain body text, not HTML markup', async () => {
    const { service, publicContent } = await seed();
    const published = { status: 'published' as const };
    await service.create(
      input({ ...published, title: 'Alpha', document: doc('Needle') }),
      ADMIN,
    );
    await service.create(
      input({ ...published, title: 'Beta', excerpt: 'has a NEEDLE' }),
      ADMIN,
    );
    await service.create(input({ title: 'Needle draft' }), ADMIN);

    const slugs = async (query: Record<string, unknown>) =>
      (await publicContent.list(query)).items.map((item) => item.slug).sort();

    expect(await slugs({ search: 'needle' })).toEqual(['alpha', 'beta']);
    expect(await slugs({ search: 'Intro Needle' })).toEqual(['alpha']);
    expect(await slugs({ search: 'strong' })).toEqual([]);
    expect(await slugs({ search: '<p>' })).toEqual([]);
    expect(await slugs({ search: '  ' })).toEqual(['alpha', 'beta']);
  });

  test('archives filter by category (with descendants) and tag; totals match the filters', async () => {
    const { service, publicContent, news, local, other, hot } = await seed();
    const published = { status: 'published' as const };
    await service.create(
      input({ ...published, title: 'In news', categoryIds: [news.id] }),
      ADMIN,
    );
    await service.create(
      input({
        ...published,
        title: 'In local',
        categoryIds: [local.id],
        tagIds: [hot.id],
      }),
      ADMIN,
    );
    await service.create(
      input({ ...published, title: 'In other', categoryIds: [other.id] }),
      ADMIN,
    );
    await service.create(
      input({ title: 'Draft news', categoryIds: [news.id], tagIds: [hot.id] }),
      ADMIN,
    );

    const page = await publicContent.list({ category: 'news', pageSize: 1 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(
      (await publicContent.list({ category: 'local' })).items.map(
        (item) => item.slug,
      ),
    ).toEqual(['in-local']);
    expect((await publicContent.list({ tag: 'hot' })).total).toBe(1);
    expect((await publicContent.list({ category: 'missing' })).total).toBe(0);
    // A forged status never exposes drafts.
    expect(
      (await publicContent.list({ status: 'draft', category: 'news' })).total,
    ).toBe(2);
    expect((await service.list({ category: 'news' }, ADMIN)).total).toBe(3);
    expect(
      (await service.list({ tag: 'hot', status: 'draft' }, ADMIN)).total,
    ).toBe(1);
    expect(await codeOf(publicContent.list({ category: 'Bad Slug!' }))).toBe(
      'invalid_input',
    );
  });

  test('public content rejects private nested terms and SEO from filters', async () => {
    const { service, publicContent, hooks, news } = await seed();
    await service.create(
      input({
        title: 'Live',
        status: 'published',
        categoryIds: [news.id],
        seo: {
          ...DEFAULT_ENTRY_SEO,
          title: 'Public search title',
          authorName: 'Explicit byline',
          focusKeyword: 'PRIVATE_FOCUS_SENTINEL',
        },
      }),
      ADMIN,
    );
    const plugin = hooks.registrar('plugin');
    plugin.filter('content.public', (value) => ({
      ...value,
      categories: value.categories.map((term) => ({ ...term, extra: 1 })),
    }));
    plugin.filter(
      'content.public',
      (value) => ({ ...value, tags: [{}] }) as unknown as typeof value,
    );
    plugin.filter('content.public', (value) => ({
      ...value,
      title: 'Must be rejected',
      seo: { ...value.seo, focusKeyword: 'PRIVATE_FOCUS_SENTINEL' },
    }));
    plugin.filter('content.public', (value) => ({
      ...value,
      title: 'Must also be rejected',
      seo: { ...value.seo, privateExtra: 'PRIVATE_EXTRA_SENTINEL' },
    }));
    plugin.filter('content.public', (value) => ({
      ...value,
      id: 'other-id',
      slug: 'other-slug',
      path: '/other-path',
      seo: {
        ...value.seo,
        canonicalUrl: 'https://example.com/hijacked',
        noIndex: true,
      },
      html: '<p>Decorated</p>',
      meta: { decorated: true },
    }));

    const item = await publicContent.getBySlug('live');
    expect(item.title).toBe('Live');
    expect(item.id).not.toBe('other-id');
    expect(item.slug).toBe('live');
    expect(item.path).toBe('/live');
    expect(item.html).toBe('<p>Decorated</p>');
    expect(item.meta).toEqual({ decorated: true });
    expect(item.seo).toMatchObject({
      title: 'Public search title',
      authorName: 'Explicit byline',
      canonicalUrl: '',
      noIndex: false,
    });
    expect(JSON.stringify(item)).not.toContain('PRIVATE_');
    expect(JSON.stringify(await publicContent.list({}))).not.toContain(
      'focusKeyword',
    );
    expect(item.categories).toEqual([
      { id: news.id, name: 'News', slug: 'news' },
    ]);
    expect(item.tags).toEqual([]);
  });

  test('removing a term unassigns it from content', async () => {
    const { service, taxonomy, hot } = await seed();
    const entry = await service.create(input({ tagIds: [hot.id] }), ADMIN);
    await taxonomy.remove('tag', hot.id);
    expect((await service.get(entry.id, ADMIN)).tags).toEqual([]);
  });
});

describe('Prisma published content reads', () => {
  test('filter drafts in the query and never fetch editor documents or private fields', async () => {
    const term = (id: string, name: string, taxonomy: string) => ({
      term: { id, name, slug: name.toLowerCase(), taxonomy },
    });
    // The document is not JSON: parsing it on a public read would throw.
    const stored: Record<string, unknown> = {
      id: 'c1',
      type: 'post',
      slug: 'live',
      title: 'Live',
      excerpt: 'Short',
      html: '<p>Body</p>',
      document: 'PRIVATE_DOCUMENT{',
      searchText: 'PRIVATE_SEARCH',
      authorId: 'PRIVATE_AUTHOR',
      status: 'published',
      publishedAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...toSeoColumns({
        ...DEFAULT_ENTRY_SEO,
        title: 'Public title',
        focusKeyword: 'PRIVATE_FOCUS',
      }),
      sticky: false,
      commentCount: 0,
      summary: 'Generated',
      passwordHash: null,
      author: { name: 'Ann', slug: 'ann' },
      featuredMedia: null,
      fields: '{"secret":"PRIVATE_FIELD"}',
      currentPath: { path: new TextEncoder().encode('/live') },
      terms: [
        term('t2', 'Zeta', 'category'),
        term('t3', 'Hot', 'tag'),
        term('t1', 'Alpha', 'category'),
      ],
    };
    type Query = {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    };
    const queries: Query[] = [];
    const read = (query: Query) => {
      queries.push(query);
      return Object.fromEntries(
        Object.keys(query.select!).map((key) => [key, stored[key]]),
      );
    };
    const db = {
      content: {
        findUnique: async (query: Query) => read(query),
        findMany: async (query: Query) => [read(query)],
        count: async (query: Query) => (queries.push(query), 1),
      },
      $transaction: (calls: Promise<unknown>[]) => Promise.all(calls),
    } as unknown as Database;
    const reader = new PublishedContentReader(
      new PrismaPublishedContentRepository(db),
    );

    const item = await reader.getBySlug('live');
    expect(item).toEqual({
      id: 'c1',
      type: 'post',
      slug: 'live',
      path: '/live',
      title: 'Live',
      excerpt: 'Short',
      html: '<p>Body</p>',
      publishedAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      extraTerms: [],
      categories: [
        { id: 't1', name: 'Alpha', slug: 'alpha' },
        { id: 't2', name: 'Zeta', slug: 'zeta' },
      ],
      tags: [{ id: 't3', name: 'Hot', slug: 'hot' }],
      author: { name: 'Ann', slug: 'ann' },
      sticky: false,
      commentCount: 0,
      protected: false,
      featuredImage: null,
      fields: {},
      seo: { ...toPublicEntrySeo(DEFAULT_ENTRY_SEO), title: 'Public title' },
      meta: {},
    });
    expect(await reader.getById('c1')).toEqual(item);
    const page = await reader.list({ search: '50%_off', status: 'draft' });
    expect(page.items).toEqual([item!]);
    expect(page.total).toBe(1);

    expect(queries.map(({ where }) => where.status)).toEqual(
      Array(4).fill('published'),
    );
    expect(queries[2]!.where.AND).toEqual([
      { trashedAt: null },
      {
        OR: [
          { title: { contains: '50\\%\\_off' } },
          { excerpt: { contains: '50\\%\\_off' } },
          { searchText: { contains: '50\\%\\_off' } },
        ],
      },
    ]);
    for (const { select = {} } of queries)
      for (const key of [
        'document',
        'searchText',
        'authorId',
        'status',
        'createdAt',
        'seoFocusKeyword',
      ])
        expect(select).not.toHaveProperty(key);
  });
});

describe('embeds', () => {
  test('known providers become privacy-friendly players; others stay links', async () => {
    const embeds = new Embeds(() => [youtube, vimeo]);
    const figure = (url: string) =>
      `<figure data-embed-url="${url}" class="embed"><a href="${url}" rel="noopener nofollow">${url}</a></figure>`;

    const html = await embeds.expand(
      [
        figure('https://youtu.be/dQw4w9WgXcQ'),
        figure('https://vimeo.com/123456'),
        figure('https://example.com/?a=1&amp;b=2'),
        figure('https://www.youtube.com/watch?v=bad"onload'),
      ].join(''),
    );
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"',
    );
    expect(html).toContain('src="https://player.vimeo.com/video/123456?dnt=1"');
    expect(html).toContain(figure('https://example.com/?a=1&amp;b=2'));
    expect(html.match(/<iframe/g)).toHaveLength(2);
  });
});

describe('content types and fields', () => {
  test('custom types validate fields, and only public fields reach the site', async () => {
    const settings = new MemorySettings();
    const repository = new MemoryContentRepository();
    const types = new ContentTypeService(settings, (type) =>
      repository.typeInUse(type),
    );
    const fields = testFields(settings);
    const hooks = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    const service = new ContentService({
      repository,
      renderer: tiptapRenderer,
      hooks,
      ids: sequentialIds(),
      clock: fixedClock(),
      users: noUsers,
      revisions: new MemoryRevisionRepository(),
      hasher: plainHasher,
      types,
      fields,
    });
    const published = new MemoryPublishedContentRepository(repository);
    const publicContent = new PublicContentService(
      new PublishedContentReader(published),
      hooks,
      testLocks(published),
      new Embeds(() => []),
      fields,
      types,
    );

    expect(
      await codeOf(
        types.create({ key: 'category', name: 'C', pluralName: 'Cs' }, ADMIN),
      ),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        types.create(
          { key: 'book', name: 'B', pluralName: 'Bs' },
          { id: 'x', role: 'editor' },
        ),
      ),
    ).toBe('forbidden');
    await types.create(
      { key: 'book', name: 'Book', pluralName: 'Books' },
      ADMIN,
    );
    await fields.create(
      {
        key: 'isbn',
        label: 'ISBN',
        type: 'text',
        required: true,
        contentTypes: ['book'],
      },
      ADMIN,
    );
    await fields.create(
      {
        key: 'cost',
        label: 'Cost',
        type: 'number',
        public: false,
        contentTypes: ['book'],
      },
      ADMIN,
    );

    expect(await codeOf(service.create(input({ type: 'movie' }), ADMIN))).toBe(
      'invalid_input',
    );
    expect(await codeOf(service.create(input({ type: 'book' }), ADMIN))).toBe(
      'invalid_input',
    );
    const book = await service.create(
      input({
        type: 'book',
        status: 'published',
        fields: { isbn: '978-1', cost: 12, extra: 'dropped' },
      }),
      ADMIN,
    );
    expect(book.fields).toEqual({ isbn: '978-1', cost: 12 });
    expect((await publicContent.getBySlug(book.slug)).fields).toEqual({
      isbn: '978-1',
    });
    expect(await codeOf(types.remove('book', ADMIN))).toBe('conflict');
  });
});
