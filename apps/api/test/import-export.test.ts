import { expect, test } from 'bun:test';
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
    }),
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
  const news = await source.taxonomy.create('category', { name: 'News' });
  const local = await source.taxonomy.create('category', {
    name: 'Local',
    parentId: news.id,
  });
  const tag = await source.taxonomy.create('tag', { name: 'Rain & <Snow>' });
  const post = await source.service.create(
    {
      type: 'post',
      title: 'Storm ]]> warning',
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

  const xml = await source.exporter.exportWxr(ADMIN);
  const target = await site();
  expect(await target.importer.importWxr(xml, ADMIN)).toEqual({
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
    categories: [{ slug: 'local' }],
    tags: [{ name: 'Rain & <Snow>' }],
  });
  expect(entry.html).toContain('Heavy rain');
  const [importedLocal] = (await target.taxonomy.list('category')).filter(
    (term) => term.slug === 'local',
  );
  expect(
    (await target.taxonomy.list('category')).find(
      (term) => term.id === importedLocal!.parentId,
    )?.slug,
  ).toBe('news');
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
<item><title>Classic</title><dc:creator>someone</dc:creator><content:encoded><![CDATA[First line

Second <script>x()</script>para]]></content:encoded><wp:post_name>classic</wp:post_name><wp:status>draft</wp:status><wp:post_type>post</wp:post_type></item>
</channel></rss>`;
  const result = await target.importer.importWxr(xml, ADMIN);
  expect(result).toMatchObject({ content: 1, skipped: [{ title: 'Logo' }] });
  const [entry] = [...target.content.rows.values()];
  expect(entry!.html).toBe('<p>First line</p><p>Second para</p>');
  expect(
    await target.importer
      .importWxr('<!DOCTYPE x [<!ENTITY a "b">]><rss/>', ADMIN)
      .catch((error: { code: string }) => error.code),
  ).toBe('invalid_input');
});
