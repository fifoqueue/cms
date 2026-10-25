import { expect, test } from 'bun:test';
import type { MenusSettings } from '@cms/sdk';
import { CONTENT_DOCUMENT_LIMITS, wxrImportResultSchema } from '@cms/sdk';
import { Errors } from '#api/shared/errors';
import { PatternService } from '#api/domain/content/pattern-service';
import { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { ExportService } from '#api/domain/tools/export-service';
import { ImportService } from '#api/domain/tools/import-service';
import type { ImportMediaDeps } from '#api/domain/tools/import-media';
import type { AdminMedia } from '@cms/sdk';
import { classicHtml } from '#api/domain/tools/classic-content';
import type { UserService } from '#api/domain/users/user-service';
import { tiptapHtmlParser, tiptapRenderer } from '#api/infra/system';
import { fastXmlWxrParser } from '#api/infra/wxr-parser';
import {
  ADMIN,
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
  sequentialIds,
  testTypes,
  userRecord,
} from '#test/support/memory';
import { testContentService } from '#test/support/content';
import { MemoryCommentRepository } from '#test/support/memory-comments';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';
import { MemoryUserDirectory } from '#test/support/memory-users';
import { MemoryUsers } from '#test/support/sso-memory';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

/** One site on in-memory adapters. */
const site = async (
  accounts?: Pick<UserService, 'create'>,
  attachments?: ImportMediaDeps,
) => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const content = new MemoryContentRepository();
  const ids = sequentialIds();
  const clock = fixedClock('2026-06-01T00:00:00.000Z');
  const terms = new MemoryTaxonomyRepository(content);
  const taxonomy = new TaxonomyService({ repository: terms, ids, clock });
  const service = testContentService({ repository: content, ids, clock });
  const comments = new MemoryCommentRepository(content);
  const settings = new MemorySettings();
  const patterns = new PatternService({
    settings,
    transactions: settings,
    catalog: settings,
    renderer: tiptapRenderer,
    ids,
    clock,
  });
  const users = new MemoryUsers();
  await users.insert(userRecord({ id: ADMIN.id, email: 'admin@example.com' }));
  const directory = new MemoryUserDirectory(users, content);
  let menus: MenusSettings = {
    menus: [],
    locations: { primary: null, footer: null },
  };
  return {
    hooks,
    content,
    service,
    taxonomy,
    comments,
    patterns,
    clock,
    importer: new ImportService({
      attachments,
      hooks,
      parser: fastXmlWxrParser,
      html: tiptapHtmlParser,
      content: service,
      taxonomy,
      types: testTypes(),
      comments,
      users: directory,
      ids,
      clock,
      patterns,
      accounts,
      tokens: { issue: () => 'import-test-password' },
      redirects: content.permalinks,
      menus: {
        get: async () => menus,
        update: async (input) => {
          menus = input as MenusSettings;
          return menus;
        },
      },
    }),
    menus: () => menus,
    exporter: new ExportService({
      hooks,
      content,
      terms,
      comments,
      users: directory,
      patterns: () => patterns.exportable(),
      site: async () => ({ title: 'Site', siteUrl: 'https://example.com' }),
    }),
  };
};

test('reusable pattern images are bound to imported media before saving', async () => {
  const media = {
    id: 'local',
    url: '/media/local.png',
    variants: [],
  } as unknown as AdminMedia;
  const target = await site(undefined, {
    settings: new MemorySettings(),
    fetch: async () => new Response(new Uint8Array([1])),
    media: {
      maxBytes: 10,
      get: async () => media,
      upload: async () => media,
      update: async () => media,
    },
  });
  await target.importer.importWxr(
    `<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><wp:wxr_version>1.2</wp:wxr_version>
<item><wp:post_id>1</wp:post_id><wp:post_type>attachment</wp:post_type><wp:attachment_url>https://old.test/image.png</wp:attachment_url></item>
<item><title>Pattern</title><wp:post_id>2</wp:post_id><wp:post_type>wp_block</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[<img src="https://old.test/image.png?ver=1">]]></content:encoded></item>
</channel></rss>`,
    ADMIN,
    { downloadAttachments: true },
  );
  const patterns = await target.patterns.exportable();
  expect(patterns).toHaveLength(1);
  expect(JSON.stringify(patterns)).toContain('/media/local.png');
  expect(JSON.stringify(patterns)).toContain('"mediaId":"local"');
  expect(JSON.stringify(patterns)).not.toContain('https://old.test');
});

test('WXR extension items round trip, validate filters, and emit completion', async () => {
  const source = await site();
  const target = await site();
  const actions: unknown[] = [];
  source.hooks.registrar('test').on('export.generated', (value) => {
    actions.push(value);
  });
  target.hooks.registrar('test').on('import.completed', (value) => {
    actions.push(value);
  });
  source.hooks.registrar('test').filter('export.data', () => [
    {
      id: 'extra',
      type: 'post',
      title: 'Extra',
      slug: 'extra',
      html: '<p>Hello</p>',
      excerpt: '',
      status: 'publish',
      publishedAt: null,
      author: '',
      password: 'open-sesame',
      sticky: false,
      commentsOpen: true,
      categories: [],
      tags: [],
      comments: [],
    },
  ]);
  source.hooks.registrar('bad').filter('export.data', () => [null] as never);
  source.hooks
    .registrar('oversized')
    .filter('export.data', (items) =>
      items.map((item) => ({ ...item, html: 'x'.repeat(16 * 1024 * 1024) })),
    );
  let items = 0;
  target.hooks.registrar('test').filter('import.item', (item) => {
    items++;
    expect(item).not.toHaveProperty('password');
    return { ...item, title: 'Changed', password: '' } as typeof item;
  });
  target.hooks.registrar('bad').filter('import.item', () => null as never);
  const xml = await source.exporter.exportWxr(ADMIN);
  expect(xml).toContain('Extra');
  const result = await target.importer.importWxr(xml, ADMIN);
  expect(result.content).toBe(1);
  expect(items).toBe(1);
  // The file's password survives a filter that tries to clear it.
  expect(
    [...target.content.rows.values()].map((row) => row.passwordHash !== null),
  ).toEqual([true]);
  expect(actions).toEqual([{ format: 'wxr' }, result]);
  expect(await target.exporter.exportWxr(ADMIN)).toContain('Changed');
});

test('classic imports bound malformed shortcodes and generated galleries', () => {
  const attachments = {
    url: () => undefined,
    childImages: () =>
      Array.from(
        { length: 100 },
        () => `https://example.com/${'a'.repeat(1900)}.jpg`,
      ),
  };
  expect(() =>
    classicHtml('[caption]'.repeat(16_000), '', attachments),
  ).toThrow('import content limit');
  expect(() => classicHtml('[gallery]'.repeat(100), '', attachments)).toThrow(
    'import content limit',
  );
  expect(classicHtml('[caption]Unclosed', '', attachments)).toContain(
    '[caption]Unclosed',
  );
});

test('classic imports retain blank lines and indentation inside preformatted code', () => {
  const source = '<pre><code>first\n\n  second\n</code></pre>';
  const html = classicHtml(source, '', {
    url: () => undefined,
    childImages: () => [],
  });
  expect(tiptapHtmlParser.parse(html)).toEqual(tiptapHtmlParser.parse(source));
});

test('classic shortcode boundaries preserve Unicode text and the following paragraph', () => {
  const html = classicHtml(
    '[caption]<img src="https://example.com/a.jpg">İ[/caption]AFTER',
    '',
    { url: () => undefined, childImages: () => [] },
  );
  expect(html).toContain('<figcaption>İ</figcaption>');
  expect(html).toContain('<p>AFTER</p>');
});

test('classic shortcodes inside quoted HTML attributes remain inert', () => {
  const attachments = {
    url: () => 'https://example.com/a.jpg',
    childImages: () => [],
  };
  for (const value of ['[gallery ids=1]', '> [gallery ids=1]']) {
    const source = `<div data-note="${value}">keep this</div>`;
    expect(
      tiptapHtmlParser.parse(classicHtml(source, '', attachments)),
    ).toEqual(tiptapHtmlParser.parse(source));
  }
});

test('an over-budget author import creates no accounts or content', async () => {
  let created = 0;
  const target = await site({
    create: async () => {
      created++;
      throw new Error('unexpected account creation');
    },
  });
  const records = Array.from(
    { length: 101 },
    (_, i) =>
      `<wp:author><wp:author_login>user${i}</wp:author_login><wp:author_email>user${i}@example.com</wp:author_email></wp:author><item><dc:creator>user${i}</dc:creator><wp:post_type>post</wp:post_type><wp:status>draft</wp:status></item>`,
  ).join('');
  await expect(
    target.importer.importWxr(
      `<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><wp:wxr_version>1.2</wp:wxr_version>${records}</channel></rss>`,
      ADMIN,
      { authors: 'author' },
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(created).toBe(0);
  expect(target.content.rows.size).toBe(0);
});

test('a WXR export imports into another site with terms, entries and threaded comments', async () => {
  const source = await site();
  const news = await source.taxonomy.create('category', { name: '소식' });
  const local = await source.taxonomy.create('category', {
    name: '지역',
    parentId: news.id,
  });
  const tag = await source.taxonomy.create('tag', { name: 'Rain & <Snow>' });
  const post = await source.service.create(
    {
      type: 'post',
      title: 'Storm ]]> warning',
      slug: '폭풍-경보',
      status: 'published',
      sticky: true,
      categoryIds: [local.id],
      tagIds: [tag.id],
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Heavy rain' }],
          },
          {
            type: 'video',
            attrs: {
              src: 'https://example.com/movie.mp4',
              caption: 'Storm footage',
            },
          },
          {
            type: 'file',
            attrs: { src: 'https://example.com/report.pdf', name: 'Report' },
          },
        ],
      },
    },
    ADMIN,
  );
  const at = new Date('2026-05-01T00:00:00.000Z');
  const parent = {
    id: 'c1',
    contentId: post.id,
    parentId: null,
    userId: null,
    authorName: 'Ann',
    authorEmail: 'ann@example.com',
    authorUrl: '',
    body: 'Stay safe',
    status: 'approved' as const,
    createdAt: at,
    updatedAt: at,
  };
  await source.comments.insert(parent);
  await source.comments.insert({
    ...parent,
    id: 'c2',
    parentId: 'c1',
    body: 'Thanks',
    createdAt: new Date('2026-05-02T00:00:00.000Z'),
  });

  const xml = (await source.exporter.exportWxr(ADMIN))
    .replaceAll('지역', encodeURIComponent('지역'))
    .replaceAll('소식', encodeURIComponent('소식'));
  const target = await site();
  expect(await target.importer.importWxr(xml, ADMIN)).toMatchObject({
    content: 1,
    categories: 2,
    tags: 1,
    comments: 2,
    skipped: [],
  });

  const [imported] = [...target.content.rows.values()];
  const entry = (await target.content.findById(imported!.id))!;
  expect(entry).toMatchObject({
    title: 'Storm ]]> warning',
    slug: post.slug,
    status: 'published',
    sticky: true,
    categories: [{ slug: '지역' }],
    tags: [{ name: 'Rain & <Snow>' }],
  });
  expect(entry.html).toContain('Heavy rain');
  expect(entry.document.content?.map((node) => node.type)).toEqual([
    'paragraph',
    'video',
    'file',
  ]);
  expect(entry.html).toContain('Storm footage');
  expect(entry.html).toContain('https://example.com/report.pdf');
  const [importedLocal] = (await target.taxonomy.list('category')).filter(
    (term) => term.slug === '지역',
  );
  expect(
    (await target.taxonomy.list('category')).find(
      (term) => term.id === importedLocal!.parentId,
    )?.slug,
  ).toBe('소식');
  const thread = (await target.comments.thread(entry.id, 1, 10, 3)).items;
  expect(thread.map((comment) => [comment.body, comment.depth])).toEqual([
    ['Stay safe', 0],
    ['Thanks', 1],
  ]);
});

test('patterns, teaser and page breaks survive a WXR round trip, and synced edits show everywhere', async () => {
  const source = await site();
  const paragraph = (text: string) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  });
  const pattern = await source.patterns.create(
    {
      title: 'Signup',
      document: { type: 'doc', content: [paragraph('Join us')] },
    },
    ADMIN,
  );
  const outer = await source.patterns.create(
    {
      title: 'Outer',
      document: {
        type: 'doc',
        content: [{ type: 'patternRef', attrs: { ref: pattern.id } }],
      },
    },
    ADMIN,
  );
  await source.service.create(
    {
      type: 'post',
      title: 'Long read',
      status: 'published',
      document: {
        type: 'doc',
        content: [
          paragraph('Teaser text'),
          { type: 'more' },
          paragraph('Rest'),
          { type: 'pageBreak' },
          { type: 'patternRef', attrs: { ref: outer.id } },
        ],
      },
    },
    ADMIN,
  );
  const [entry] = [...source.content.rows.values()];
  // The teaser is the summary; the served body shows the pattern's current text.
  expect(entry?.summary).toBe('Teaser text');
  source.clock.set('2026-06-02T00:00:00.000Z');
  await source.patterns.update(
    pattern.id,
    {
      title: 'Signup',
      document: { type: 'doc', content: [paragraph('Join today')] },
    },
    ADMIN,
  );
  expect(await source.patterns.expand(entry!.html)).toContain('Join today');

  const xml = await source.exporter.exportWxr(ADMIN);
  expect(xml).toContain('<!--more-->');
  expect(xml).toContain('<!--nextpage-->');

  const target = await site();
  expect(xml.indexOf('<title><![CDATA[Outer]]>')).toBeLessThan(
    xml.indexOf('<title><![CDATA[Signup]]>'),
  );
  const result = await target.importer.importWxr(xml, ADMIN);
  expect(result.skipped).toEqual([]);
  const { items } = await target.patterns.list({}, ADMIN);
  const copy = items.find((item) => item.title === 'Outer');
  const inner = items.find((item) => item.title === 'Signup');
  expect(
    (await target.patterns.get(copy!.id, ADMIN)).document.content?.[0]?.attrs,
  ).toEqual({ ref: inner!.id });
  const imported = [...target.content.rows.values()][0]!;
  expect(imported.document.content?.map((node) => node.type)).toEqual([
    'paragraph',
    'more',
    'paragraph',
    'pageBreak',
    'patternRef',
  ]);
  expect(
    (imported.document.content?.[4]?.attrs as { ref?: string } | undefined)
      ?.ref,
  ).toBe(copy!.id);
  expect(await target.patterns.expand(imported.html)).toContain('Join today');
});

test('pattern references expand only to published patterns, without cycles', async () => {
  const { patterns } = await site();
  const ref = (id: string) => ({ type: 'patternRef', attrs: { ref: id } });
  const draft = await patterns.create(
    {
      title: 'Draft',
      status: 'draft',
      document: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Secret' }] },
        ],
      },
    },
    ADMIN,
  );
  const loop = await patterns.create(
    {
      title: 'Loop',
      document: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
    ADMIN,
  );
  await patterns.update(
    loop.id,
    {
      title: 'Loop',
      document: { type: 'doc', content: [ref(loop.id), ref(draft.id)] },
    },
    ADMIN,
  );
  const html = `<div class="cms-pattern" data-cms-pattern="${loop.id}"></div>`;
  expect(await patterns.expand(html)).toBe('');
  // A contributor can neither publish a pattern nor change someone else's.
  const contributor = { id: 'c', role: 'contributor' };
  await expect(
    patterns.create(
      {
        title: 'X',
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      contributor,
    ),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(patterns.remove(loop.id, contributor)).rejects.toMatchObject({
    code: 'forbidden',
  });
});

test('WordPress-only items are reported, and files with a DTD are refused', async () => {
  const target = await site();
  const xml = `<?xml version="1.0"?>
<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"><channel>
<wp:wxr_version>1.2</wp:wxr_version>
<item><title>Logo</title><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status></item>
<item><title>Huge gallery</title><content:encoded><![CDATA[<figure class="wp-block-gallery">${'<img src="https://example.com/a.jpg">'.repeat(101)}</figure>]]></content:encoded><wp:status>draft</wp:status><wp:post_type>post</wp:post_type></item>
<item><title>Classic</title><dc:creator>someone</dc:creator><content:encoded><![CDATA[First line

Second <script>x()</script>para]]></content:encoded><wp:post_name>classic</wp:post_name><wp:status>draft</wp:status><wp:post_type>post</wp:post_type></item>
<item><title>Seven columns</title><content:encoded><![CDATA[<figure class="wp-block-gallery columns-7"><img src="https://example.com/a.jpg"></figure>]]></content:encoded><wp:status>draft</wp:status><wp:post_type>post</wp:post_type></item>
<item><title>Long type</title><wp:status>draft</wp:status><wp:post_type>${'t'.repeat(600)}</wp:post_type></item>
</channel></rss>`;
  const result = await target.importer.importWxr(xml, ADMIN);
  // An unusable body skips its entry only; out-of-range block settings fall back to defaults.
  expect(result).toMatchObject({
    content: 2,
    skipped: [
      {
        title: 'Logo',
        reason: Errors.ImportItemUnsupported,
        params: { type: 'attachment', status: 'inherit' },
      },
      { title: 'Huge gallery' },
      // Values from the file are bounded, so the result always parses.
      {
        title: 'Long type',
        params: { type: 't'.repeat(500), status: 'draft' },
      },
    ],
  });
  expect(wxrImportResultSchema.safeParse(result).success).toBe(true);
  // A refusal keeps the values its catalog message leaves out.
  expect(result.skipped[1]).toMatchObject({
    reason: Errors.InvalidDocument,
    params: { detail: expect.any(String) },
  });
  const [entry, gallery] = [...target.content.rows.values()];
  expect(entry!.html).toBe('<p>First line</p><p>Second para</p>');
  expect(gallery!.html).toContain('data-columns="3"');
  expect(
    await target.importer
      .importWxr('<!DOCTYPE x [<!ENTITY a "b">]><rss/>', ADMIN)
      .catch((error: { code: string }) => error.code),
  ).toBe('invalid_input');
});

test('a WordPress site keeps its slugs, old addresses, page parents, shortcodes and menus', async () => {
  const target = await site();
  const meta = (key: string, value: string) =>
    `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;
  const xml = `<?xml version="1.0"?>
<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"><channel>
<link>https://old.example</link>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_site_url>https://old.example</wp:base_site_url>
<item><title>About</title><link>https://old.example/about/</link><wp:post_id>10</wp:post_id><wp:post_name>about</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type><wp:post_parent>0</wp:post_parent></item>
<item><title>Team</title><link>https://old.example/about/team/</link><wp:post_id>11</wp:post_id><wp:post_name>team</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type><wp:post_parent>10</wp:post_parent></item>
<item><title>News</title><link>https://old.example/2019/05/%ec%86%8c%ec%8b%9d/</link><wp:post_id>20</wp:post_id><wp:post_name>%ec%86%8c%ec%8b%9d</wp:post_name><wp:status>publish</wp:status><wp:post_type>post</wp:post_type>
<content:encoded><![CDATA[Intro line
second line

[caption id="attachment_30" align="aligncenter" width="300"]<img src="https://old.example/uploads/a.jpg" alt="A"> Photo caption[/caption]

[gallery ids="30,31" columns="2"]

[embed]https://www.youtube.com/watch?v=abcdefghijk[/embed]]]></content:encoded>${meta('_thumbnail_id', '30')}</item>
<item><title>A</title><wp:post_id>30</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:post_parent>20</wp:post_parent><wp:attachment_url>https://old.example/uploads/a.jpg</wp:attachment_url></item>
<item><title>B</title><wp:post_id>31</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:attachment_url>https://old.example/uploads/b.jpg</wp:attachment_url></item>
<item><title></title><wp:post_id>40</wp:post_id><wp:post_type>nav_menu_item</wp:post_type><wp:status>publish</wp:status><wp:menu_order>1</wp:menu_order><category domain="nav_menu" nicename="main"><![CDATA[Main]]></category>${meta('_menu_item_type', 'post_type')}${meta('_menu_item_object_id', '10')}${meta('_menu_item_menu_item_parent', '0')}</item>
<item><title>Elsewhere</title><wp:post_id>41</wp:post_id><wp:post_type>nav_menu_item</wp:post_type><wp:status>publish</wp:status><wp:menu_order>2</wp:menu_order><category domain="nav_menu" nicename="main"><![CDATA[Main]]></category>${meta('_menu_item_type', 'custom')}${meta('_menu_item_url', 'https://elsewhere.example/')}${meta('_menu_item_menu_item_parent', '40')}</item>
</channel></rss>`;

  const result = await target.importer.importWxr(xml, ADMIN);
  expect(result).toMatchObject({ content: 3, menus: 1, skipped: [] });
  expect(result.attachments).toEqual([
    { url: 'https://old.example/uploads/a.jpg', title: 'A', featured: 1 },
    { url: 'https://old.example/uploads/b.jpg', title: 'B', featured: 0 },
  ]);

  const rows = [...target.content.rows.values()];
  const about = rows.find((row) => row.slug === 'about')!;
  const team = rows.find((row) => row.slug === 'team')!;
  const news = rows.find((row) => row.slug === '소식')!;
  expect(team.parentId).toBe(about.id);

  // Old addresses that differ from the new ones redirect to them; equal ones need none.
  const redirects = [...target.content.permalinks.paths.values()].filter(
    (path) => !path.current,
  );
  expect(redirects).toContainEqual({
    path: '/2019/05/%EC%86%8C%EC%8B%9D',
    contentId: news.id,
    current: false,
  });
  expect(redirects.some((path) => path.path.startsWith('/about/'))).toBe(
    (await target.content.findById(team.id))!.path !== '/about/team',
  );
  expect(result.redirects).toBe(redirects.length);

  const body = JSON.stringify(news.document);
  expect(news.html).toStartWith('<p>Intro line<br/>second line</p>');
  expect(body).toContain('"caption":"Photo caption"');
  expect(body).toContain('"type":"gallery"');
  expect(body).toContain('https://old.example/uploads/b.jpg');
  expect(body).toContain('"type":"embed"');

  const menus = target.menus();
  expect(menus.locations.primary).toBe(menus.menus[0]!.id);
  expect(menus.menus[0]).toMatchObject({
    name: 'Main',
    items: [
      {
        kind: 'content',
        contentId: about.id,
        children: [{ kind: 'custom', url: 'https://elsewhere.example/' }],
      },
    ],
  });
});

test('pattern expansion counts repeated cached references, including nested occurrences', async () => {
  const { patterns } = await site();
  let current = await patterns.create(
    {
      title: 'Leaf',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x'.repeat(1024) }],
          },
        ],
      },
    },
    ADMIN,
  );
  for (let depth = 0; depth < 3; depth++) {
    current = await patterns.create(
      {
        title: `Level ${depth}`,
        document: {
          type: 'doc',
          content: Array.from({ length: 20 }, () => ({
            type: 'patternRef',
            attrs: { ref: current.id },
          })),
        },
      },
      ADMIN,
    );
  }
  const html = await patterns.expand(
    `<div class="cms-pattern" data-cms-pattern="${current.id}"></div>`,
  );
  expect(html.length).toBeGreaterThan(1024);
  expect(html.length).toBeLessThanOrEqual(50 * 1031);
  expect(html).not.toContain('data-cms-pattern');
});

test('pattern expansion rejects aggregate bytes before returning partial markup', async () => {
  const { patterns } = await site();
  const pattern = await patterns.create(
    {
      title: 'Large',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '한'.repeat(100_000) }],
          },
        ],
      },
    },
    ADMIN,
  );
  const marker = `<div class="cms-pattern" data-cms-pattern="${pattern.id}"></div>`;
  expect(
    new TextEncoder().encode(await patterns.expand(marker.repeat(3))).length,
  ).toBeLessThan(1024 * 1024);
  expect(await patterns.expand(marker.repeat(4))).toBe('');
});

test('contributors cannot change or remove their pattern after an editor publishes it', async () => {
  const { patterns } = await site();
  const contributor = { id: 'contributor', role: 'contributor' };
  const input = {
    title: 'Reviewed',
    status: 'draft',
    document: { type: 'doc', content: [{ type: 'paragraph' }] },
  };
  const pattern = await patterns.create(input, contributor);
  await patterns.update(pattern.id, { ...input, status: 'published' }, ADMIN);
  await expect(
    patterns.update(pattern.id, input, contributor),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(patterns.remove(pattern.id, contributor)).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect((await patterns.get(pattern.id, ADMIN)).status).toBe('published');
});

test('a rejected imported pattern body removes its staged draft and reports the failure', async () => {
  const source = await site();
  await source.patterns.create(
    {
      title: 'Invalid nested body',
      document: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'too deep' }] },
        ],
      },
    },
    ADMIN,
  );
  const xml = (await source.exporter.exportWxr(ADMIN)).replace(
    '<p>too deep</p>',
    `${'<blockquote>'.repeat(CONTENT_DOCUMENT_LIMITS.depth)}<p>too deep</p>${'</blockquote>'.repeat(CONTENT_DOCUMENT_LIMITS.depth)}`,
  );
  const target = await site();
  expect((await target.importer.importWxr(xml, ADMIN)).skipped).toHaveLength(1);
  expect((await target.patterns.list({}, ADMIN)).total).toBe(0);
});
