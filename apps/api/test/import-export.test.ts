import { expect, test } from 'bun:test';
import type { MenusSettings } from '@cms/sdk';
import { ContentService } from '#api/domain/content/content-service';
import { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { ExportService } from '#api/domain/tools/export-service';
import { ImportService } from '#api/domain/tools/import-service';
import { tiptapHtmlParser, tiptapRenderer } from '#api/infra/system';
import { fastXmlWxrParser } from '#api/infra/wxr-parser';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  ADMIN,
  MemoryContentRepository,
  fixedClock,
  noUsers,
  plainHasher,
  recordingLogger,
  sequentialIds,
  testFields,
  testTypes,
  userRecord,
} from '#test/support/memory';
import { MemoryCommentRepository } from '#test/support/memory-comments';
import { MemoryRevisionRepository } from '#test/support/memory-revisions';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';
import { MemoryUserDirectory } from '#test/support/memory-users';
import { MemoryUsers } from '#test/support/sso-memory';

/** One site on in-memory adapters. */
const site = async () => {
  const content = new MemoryContentRepository();
  const ids = sequentialIds();
  const clock = fixedClock('2026-06-01T00:00:00.000Z');
  const terms = new MemoryTaxonomyRepository(content);
  const taxonomy = new TaxonomyService({ repository: terms, ids, clock });
  const service = new ContentService({
    repository: content,
    renderer: tiptapRenderer,
    hooks: new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
    ids,
    clock,
    users: noUsers,
    revisions: new MemoryRevisionRepository(),
    hasher: plainHasher,
    types: testTypes(),
    fields: testFields(),
  });
  const comments = new MemoryCommentRepository(content);
  const users = new MemoryUsers();
  await users.insert(userRecord({ id: ADMIN.id, email: 'admin@example.com' }));
  const directory = new MemoryUserDirectory(users, content);
  let menus: MenusSettings = {
    menus: [],
    locations: { primary: null, footer: null },
  };
  return {
    content,
    service,
    taxonomy,
    comments,
    importer: new ImportService({
      parser: fastXmlWxrParser,
      html: tiptapHtmlParser,
      content: service,
      taxonomy,
      types: testTypes(),
      comments,
      users: directory,
      ids,
      clock,
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
      content,
      terms,
      comments,
      users: directory,
      site: async () => ({ title: 'Site', siteUrl: 'https://example.com' }),
    }),
  };
};

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
</channel></rss>`;
  const result = await target.importer.importWxr(xml, ADMIN);
  // An unusable body skips its entry only; out-of-range block settings fall back to defaults.
  expect(result).toMatchObject({
    content: 2,
    skipped: [{ title: 'Logo' }, { title: 'Huge gallery' }],
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
