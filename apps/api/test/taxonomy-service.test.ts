import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_ENTRY_SEO,
  DEFAULT_PERMALINK_SETTINGS,
  SEO_SETTINGS_DEFAULTS,
  SEO_SITEMAP_PAGE_SIZE,
  adminTaxonomyTermSchema,
  publicTaxonomyTermSchema,
  toPublicEntrySeo,
} from '@cms/sdk';
import { PublishedContentReader } from '#api/domain/content/public-content';
import { SeoDiscoveryService } from '#api/domain/seo/seo-discovery-service';
import { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import {
  PublicTaxonomyService,
  TaxonomyService,
} from '#api/domain/taxonomy/taxonomy-service';
import { TaxonomyTypeService } from '#api/domain/taxonomy/taxonomy-types';
import type { DomainError } from '#api/shared/errors';
import {
  ADMIN,
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
  sequentialIds,
} from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';
import { MemorySeoDiscoveryRepository } from '#test/support/memory-seo';

const publicSeoDefaults = toPublicEntrySeo(DEFAULT_ENTRY_SEO);

const setup = (customTaxonomies = false) => {
  const content = new MemoryContentRepository();
  const repository = new MemoryTaxonomyRepository(content);
  const ids = sequentialIds();
  const clock = fixedClock();
  const types = new TaxonomyTypeService(new MemorySettings(), repository);
  const admin = new TaxonomyService({
    repository,
    ids,
    clock,
    types: customTaxonomies ? types : undefined,
  });
  const publicTaxonomy = new PublicTaxonomyService(
    repository,
    customTaxonomies ? types : undefined,
  );
  const contentService = testContentService({
    repository: content,
    ids,
    clock,
  });
  return { admin, publicTaxonomy, contentService, clock, content, types };
};

const codeOf = async (promise: Promise<unknown>) =>
  ((await promise.catch((error: unknown) => error)) as DomainError).code;

const post = (title: string, extra: Record<string, unknown> = {}) => ({
  type: 'post',
  title,
  document: textDocument('Body'),
  ...extra,
});

describe('TaxonomyService', () => {
  test('extra term assignments reject built-in taxonomy terms', async () => {
    const { admin, contentService, content } = setup();
    const category = await admin.create('category', { name: 'News' });

    expect(
      await codeOf(
        contentService.create(
          post('Invalid assignment', { extraTermIds: [category.id] }),
          ADMIN,
        ),
      ),
    ).toBe('invalid_input');
    expect(content.rows.size).toBe(0);
  });

  test('creates terms with unique generated slugs per taxonomy', async () => {
    const { admin } = setup();
    const first = await admin.create('category', { name: 'Hello World' });
    const second = await admin.create('category', { name: 'Hello World' });
    const tag = await admin.create('tag', { name: 'Hello World' });

    expect(adminTaxonomyTermSchema.strict().parse(first)).toEqual({
      id: first.id,
      taxonomy: 'category',
      name: 'Hello World',
      slug: 'hello-world',
      description: '',
      parentId: null,
      count: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      seo: DEFAULT_ENTRY_SEO,
    });
    expect(second.slug).toBe('hello-world-2');
    expect(tag).toMatchObject({ taxonomy: 'tag', slug: 'hello-world' });
    expect(
      await codeOf(admin.create('tag', { name: 'X', slug: 'hello-world' })),
    ).toBe('conflict');
    expect(await codeOf(admin.create('category', { name: '' }))).toBe(
      'invalid_input',
    );
  });

  test('categories nest; self, cyclic, missing and cross-taxonomy parents are rejected', async () => {
    const { admin } = setup();
    const root = await admin.create('category', { name: 'Root' });
    const child = await admin.create('category', {
      name: 'Child',
      parentId: root.id,
    });
    const grandchild = await admin.create('category', {
      name: 'Grandchild',
      parentId: child.id,
    });
    const tag = await admin.create('tag', { name: 'Tag' });

    expect(child.parentId).toBe(root.id);
    // Itself, then its descendants.
    for (const parentId of [root.id, grandchild.id, child.id])
      expect(
        await codeOf(
          admin.update('category', root.id, { name: 'Root', parentId }),
        ),
      ).toBe('invalid_input');
    expect(
      await codeOf(
        admin.create('category', { name: 'Orphan', parentId: 'missing' }),
      ),
    ).toBe('invalid_input');
    expect(
      await codeOf(admin.create('category', { name: 'X', parentId: tag.id })),
    ).toBe('invalid_input');
    expect(
      await codeOf(admin.create('tag', { name: 'Nested', parentId: tag.id })),
    ).toBe('invalid_input');
    expect(
      await codeOf(admin.create('tag', { name: 'Nested', parentId: root.id })),
    ).toBe('invalid_input');

    const moved = await admin.update('category', grandchild.id, {
      name: 'Grandchild',
      parentId: root.id,
    });
    expect(moved.parentId).toBe(root.id);
  });

  test('the taxonomy in the URL scopes every operation and never changes', async () => {
    const { admin } = setup();
    const category = await admin.create('category', { name: 'News' });

    expect(await codeOf(admin.list('pages'))).toBe('not_found');
    expect(await codeOf(admin.update('tag', category.id, { name: 'X' }))).toBe(
      'not_found',
    );
    expect(await codeOf(admin.remove('tag', category.id))).toBe('not_found');

    const updated = await admin.update('category', category.id, {
      name: 'Renamed',
      taxonomy: 'tag',
    });
    expect(updated).toMatchObject({
      taxonomy: 'category',
      name: 'Renamed',
      slug: 'news',
    });
    expect(await admin.list('tag')).toEqual([]);
  });

  test('removing a category moves its children up to its parent', async () => {
    const { admin } = setup();
    const root = await admin.create('category', { name: 'Root' });
    const middle = await admin.create('category', {
      name: 'Middle',
      parentId: root.id,
    });
    const leaf = await admin.create('category', {
      name: 'Leaf',
      parentId: middle.id,
    });

    await admin.remove('category', middle.id);

    expect(
      (await admin.list('category')).map(({ id, parentId }) => ({
        id,
        parentId,
      })),
    ).toEqual([
      { id: leaf.id, parentId: root.id },
      { id: root.id, parentId: null },
    ]);
  });
});

describe('PublicTaxonomyService', () => {
  test('custom taxonomy archives include assigned published content only', async () => {
    const { admin, publicTaxonomy, contentService, content, types } =
      setup(true);
    await types.save(
      { key: 'region', name: 'Regions', hierarchical: true },
      ADMIN,
    );
    const region = await admin.create('region', { name: 'Tokyo' });
    const live = await contentService.create(
      post('Live in Tokyo', { status: 'published', extraTermIds: [region.id] }),
      ADMIN,
    );
    await contentService.create(
      post('Draft in Tokyo', { extraTermIds: [region.id] }),
      ADMIN,
    );
    await contentService.create(
      post('Elsewhere', { status: 'published' }),
      ADMIN,
    );

    const reader = new PublishedContentReader(
      new MemoryPublishedContentRepository(content),
    );
    const page = await reader.summaries({
      taxonomy: 'region',
      term: region.slug,
      status: 'draft',
    });
    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.id)).toEqual([live.id]);
    expect(page.items[0]?.extraTerms).toEqual([
      { id: region.id, name: 'Tokyo', slug: 'tokyo', taxonomy: 'region' },
    ]);
    expect((await publicTaxonomy.getBySlug('region', region.slug)).count).toBe(
      1,
    );
    expect((await admin.list('region'))[0]?.count).toBe(2);
  });

  test('counts published content only; admin counts every status', async () => {
    const { admin, publicTaxonomy, contentService } = setup();
    const news = await admin.create('category', {
      name: 'News',
      description: 'Latest',
      seo: {
        ...DEFAULT_ENTRY_SEO,
        title: 'News search title',
        focusKeyword: 'PRIVATE_TERM_FOCUS_SENTINEL',
      },
    });
    const edited = await admin.update('category', news.id, {
      name: 'News',
      description: 'Latest',
    });
    expect(edited.seo).toEqual(news.seo);
    await admin.create('category', { name: 'Empty' });
    await contentService.create(
      post('Live', { status: 'published', categoryIds: [news.id] }),
      ADMIN,
    );
    await contentService.create(
      post('Draft', { categoryIds: [news.id] }),
      ADMIN,
    );

    const listed = await publicTaxonomy.list('category');
    expect(listed.map(({ slug, count }) => ({ slug, count }))).toEqual([
      { slug: 'empty', count: 0 },
      { slug: 'news', count: 1 },
    ]);
    const term = await publicTaxonomy.getBySlug('category', 'news');
    expect(publicTaxonomyTermSchema.strict().parse(term)).toEqual({
      id: news.id,
      taxonomy: 'category',
      name: 'News',
      slug: 'news',
      description: 'Latest',
      parentId: null,
      count: 1,
      seo: { ...publicSeoDefaults, title: 'News search title' },
    });
    expect(JSON.stringify(listed)).not.toContain('PRIVATE_TERM_FOCUS_SENTINEL');
    expect(JSON.stringify(term)).not.toContain('focusKeyword');
    expect(
      (await admin.list('category')).find((item) => item.id === news.id)?.count,
    ).toBe(2);
    expect(await codeOf(publicTaxonomy.getBySlug('tag', 'news'))).toBe(
      'not_found',
    );
    expect(await codeOf(publicTaxonomy.list('nope'))).toBe('not_found');
  });
});

describe('SEO discovery', () => {
  test('filters publication and indexability before stable paging, including category ancestors', async () => {
    const { admin, contentService, content } = setup();
    const settingsStore = new MemorySettings();
    const settings = new SeoSettingsService(settingsStore);
    const discovery = new SeoDiscoveryService(
      new MemorySeoDiscoveryRepository(content),
      settings,
    );
    expect(await settings.getAdmin()).toEqual(SEO_SETTINGS_DEFAULTS);
    // Older stored settings get new defaults; unrelated stored data is never public.
    await settingsStore.set('seo', {
      homeTitle: 'Home',
      privateExtra: 'PRIVATE_SETTINGS_SENTINEL',
    });
    expect(await settings.getPublic()).toEqual({
      ...SEO_SETTINGS_DEFAULTS,
      homeTitle: 'Home',
    });

    const siteSettings = {
      ...SEO_SETTINGS_DEFAULTS,
      siteUrl: 'https://example.com',
    };
    await settings.update(siteSettings);
    const root = await admin.create('category', {
      name: 'Root',
      seo: {
        ...DEFAULT_ENTRY_SEO,
        canonicalUrl: 'https://example.com/category/root',
      },
    });
    const child = await admin.create('category', {
      name: 'Child',
      parentId: root.id,
    });
    const empty = await admin.create('category', { name: 'Empty' });
    const tag = await admin.create('tag', { name: 'Tag' });
    const hidden = await admin.create('tag', {
      name: 'Hidden',
      seo: { ...DEFAULT_ENTRY_SEO, noIndex: true },
    });
    const canonical = await admin.create('tag', {
      name: 'Canonical',
      seo: { ...DEFAULT_ENTRY_SEO, canonicalUrl: 'https://example.com/other' },
    });
    // Unicode slugs are percent-encoded in sitemap paths and self-canonical checks.
    const unicode = await admin.create('tag', {
      name: '소식',
      seo: {
        ...DEFAULT_ENTRY_SEO,
        canonicalUrl: 'https://example.com/tag/소식',
      },
    });
    await content.permalinks.saveSettings({
      ...DEFAULT_PERMALINK_SETTINGS,
      article: '/articles/%title%',
    });
    const live = await contentService.create(
      post('Live', {
        type: 'article',
        status: 'published',
        categoryIds: [child.id],
        tagIds: [tag.id, hidden.id, canonical.id, unicode.id],
        seo: {
          ...DEFAULT_ENTRY_SEO,
          title: 'Search title',
          description: 'Search description',
          canonicalUrl: 'HTTPS://EXAMPLE.COM:443/articles/Live',
          focusKeyword: 'PRIVATE_DISCOVERY_SENTINEL',
        },
      }),
      ADMIN,
    );
    await contentService.create(
      post('Draft', { categoryIds: [empty.id] }),
      ADMIN,
    );
    await contentService.create(
      post('No index', {
        status: 'published',
        seo: { ...DEFAULT_ENTRY_SEO, noIndex: true },
      }),
      ADMIN,
    );
    await contentService.create(
      post('Canonical', {
        status: 'published',
        seo: {
          ...DEFAULT_ENTRY_SEO,
          canonicalUrl: 'https://example.com/elsewhere',
        },
      }),
      ADMIN,
    );
    await contentService.create(
      post('Case', {
        type: 'article',
        status: 'published',
        seo: {
          ...DEFAULT_ENTRY_SEO,
          canonicalUrl: 'https://example.com/articles/case',
        },
      }),
      ADMIN,
    );
    const page = await discovery.list({ kind: 'content', pageSize: 1 });
    expect(page).toEqual({
      items: [
        {
          path: '/articles/Live',
          title: 'Search title',
          description: 'Search description',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
    });
    expect(JSON.stringify(page)).not.toContain('PRIVATE_');
    expect(
      (await discovery.list({ kind: 'content', page: 2, pageSize: 1 })).items,
    ).toEqual([]);
    const categories = await discovery.list({ kind: 'category', pageSize: 1 });
    expect(categories.total).toBe(2);
    expect(categories.items.map((item) => item.path)).toEqual([
      '/category/child',
    ]);
    expect(
      (
        await discovery.list({ kind: 'category', page: 2, pageSize: 1 })
      ).items.map((item) => item.path),
    ).toEqual(['/category/root']);
    expect(
      (await discovery.list({ kind: 'tag' })).items.map((item) => item.path),
    ).toEqual(['/tag/%EC%86%8C%EC%8B%9D', '/tag/tag']);
    expect(
      await codeOf(
        discovery.list({
          kind: 'content',
          pageSize: SEO_SITEMAP_PAGE_SIZE + 1,
        }),
      ),
    ).toBe('invalid_input');

    await settings.update({
      ...siteSettings,
      indexCategories: false,
      indexTags: false,
    });
    expect((await discovery.list({ kind: 'category' })).total).toBe(0);
    expect((await discovery.list({ kind: 'tag' })).total).toBe(0);
    expect((await discovery.list({ kind: 'content' })).total).toBe(1);
    await settings.update({ ...siteSettings, indexingEnabled: false });
    expect((await discovery.list({ kind: 'content' })).total).toBe(0);
    await settings.update(siteSettings);
    // Unpublishing the only assigned item removes both the archive and its ancestors.
    await contentService.update(
      live.id,
      post('Live', {
        categoryIds: [child.id],
        tagIds: [tag.id],
      }),
      ADMIN,
    );
    expect((await discovery.list({ kind: 'category' })).total).toBe(0);
    expect((await discovery.list({ kind: 'tag' })).total).toBe(0);
  });
});
