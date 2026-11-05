// Regression guard: full-text feeds never read the bodies of protected entries.
import { expect, test } from 'bun:test';
import type { PublicContent } from '@cms/sdk';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  seoSettingsSchema,
  toPublicEntrySeo,
} from '@cms/sdk';
import {
  conditionalResponse,
  isDiscoverable,
  llmsText,
  loadBodies,
  loadRecent,
  robotsText,
  rssFeed,
  sitemapChunk,
} from '#lib/server/seo-discovery.js';
import { contentMarkdown } from '#lib/server/markdown.js';
import { loadCorpus } from '#web/routes/llms-full.txt/corpus.js';

const publicSeo = toPublicEntrySeo(DEFAULT_ENTRY_SEO);
const entry = (overrides: Partial<PublicContent> = {}): PublicContent => ({
  id: 'id-1',
  type: 'post',
  slug: 'hello',
  path: '/2026/01/hello',
  title: 'Hello',
  excerpt: 'Excerpt',
  html: '<p>Body</p>',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  categories: [],
  tags: [],
  seo: publicSeo,
  meta: {},
  ...overrides,
});

test('discovery excludes protected entries and blocks training separately from AI search', () => {
  expect(
    isDiscoverable(entry({ protected: true }), SEO_SETTINGS_DEFAULTS),
  ).toBe(false);
  const robots = robotsText(SEO_SETTINGS_DEFAULTS);

  expect(robots).toContain('User-agent: ClaudeBot\nDisallow: /');
  expect(robots).toContain('User-agent: Claude-SearchBot\nDisallow: /admin$');
  expect(
    robotsText({ ...SEO_SETTINGS_DEFAULTS, indexingEnabled: false }),
  ).toContain('User-agent: *\nDisallow: /');
});

test('bot overrides validate input without weakening indexing-off policy', () => {
  const settings = seoSettingsSchema.parse({
    aiBotOverrides: 'ClaudeBot: allow\nChatGPT-User: disallow',
    extraRobotsRules: 'User-agent: ExampleBot\nDisallow: /calendar/',
  });

  expect(robotsText(settings)).toContain(
    'User-agent: ClaudeBot\nDisallow: /admin$',
  );
  expect(robotsText(settings)).toContain(
    'User-agent: ChatGPT-User\nDisallow: /',
  );
  expect(robotsText({ ...settings, indexingEnabled: false })).toContain(
    'User-agent: ClaudeBot\nDisallow: /',
  );
  expect(
    seoSettingsSchema.safeParse({
      extraRobotsRules: '<script>alert(1)</script>',
    }).success,
  ).toBe(false);
  expect(
    seoSettingsSchema.safeParse({ aiBotOverrides: '*: allow' }).success,
  ).toBe(false);
  for (const rule of [
    '/admin/',
    '/preview/',
    '/admin/private',
    '/ad%6din/',
    '/adm*',
    '/*/private',
    '/?s=',
    '/?s=private',
    '/?%73=',
    '/?s=*',
  ])
    expect(
      seoSettingsSchema.safeParse({
        extraRobotsRules: `User-agent: *\nAllow: ${rule}`,
      }).success,
    ).toBe(false);
  for (const rule of ['/', '/preview/theme/', '/public/', '/administrator/'])
    expect(
      seoSettingsSchema.safeParse({
        extraRobotsRules: `User-agent: *\nAllow: ${rule}`,
      }).success,
    ).toBe(true);
  const extras = robotsText(
    seoSettingsSchema.parse({
      extraRobotsRules:
        'Disallow: /calendar/\nUser-agent: ExampleBot\nUser-agent: OtherBot\nAllow: /public/',
    }),
  ).split('\n\n');

  expect(
    extras.some(
      (group) =>
        group.startsWith('User-agent: *\n') &&
        group.includes('Disallow: /calendar/'),
    ),
  ).toBe(true);
  const custom = extras.find((group) =>
    group.includes('User-agent: ExampleBot'),
  )!;

  expect(custom).toContain('User-agent: OtherBot');
  expect(custom).toContain('Disallow: /admin/');
  expect(custom).toContain('Disallow: /preview/');
  expect(custom).toContain('Disallow: /?s=');
  expect(custom).toContain('Allow: /preview/theme/');
});

test('conditional discovery responses validate the final body and prioritize ETags', async () => {
  const date = '2026-01-02T00:00:00.000Z';
  const response = () =>
    new Response('discovery', {
      headers: { 'cache-control': 'public, max-age=60' },
    });
  const first = await conditionalResponse(
    new Request('https://site.test/feed.xml'),
    response(),
    date,
  );
  const tag = first.headers.get('etag')!;
  const next = await conditionalResponse(
    new Request('https://site.test/feed.xml', {
      headers: { 'if-none-match': tag.replace('W/', '') },
    }),
    response(),
    date,
  );

  expect(tag).toStartWith('W/"');
  expect(next.status).toBe(304);
  expect(await next.text()).toBe('');
  expect(next.headers.get('cache-control')).toBe('public, max-age=60');
  expect(
    (
      await conditionalResponse(
        new Request('https://site.test/feed.xml', {
          headers: { 'if-modified-since': 'Fri, 02 Jan 2026 00:00:00 GMT' },
        }),
        response(),
        date,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await conditionalResponse(
        new Request('https://site.test/feed.xml', {
          headers: {
            'if-none-match': tag,
            'if-modified-since': 'Fri, 02 Jan 2026 00:00:00 GMT',
          },
        }),
        new Response('changed'),
        date,
      )
    ).status,
  ).toBe(200);
  const removed = await conditionalResponse(
    new Request('https://site.test/feed.xml', {
      headers: { 'if-modified-since': first.headers.get('last-modified')! },
    }),
    new Response('older remaining item'),
    '2026-01-01T00:00:00.000Z',
  );

  expect(removed.status).toBe(200);
  expect(await removed.text()).toBe('older remaining item');
});

test('protected entries cannot crowd public entries out of a recent list', async () => {
  const entries = [
    ...Array.from({ length: 100 }, (_, i) =>
      entry({ id: `private-${i}`, protected: true }),
    ),
    entry({ id: 'visible-1' }),
    entry({ id: 'visible-2', publishedAt: '2025-12-01T00:00:00.000Z' }),
  ];
  const api = {
    list: async ({ page = 1, pageSize = 10 }) => ({
      items: entries.slice((page - 1) * pageSize, page * pageSize),
      total: entries.length,
    }),
  } as never;

  expect(
    (await loadRecent(api, SEO_SETTINGS_DEFAULTS, undefined, 2)).map(
      (item) => item.id,
    ),
  ).toEqual(['visible-1', 'visible-2']);
});

test('frontmatter escapes authored text and discovery serializes stable feed and image metadata', async () => {
  const content = entry({
    title: 'Title:\ncanonical: malicious',
    author: { name: 'Writer', slug: 'writer' },
    categories: [{ id: 'term', name: 'News', slug: 'news' }],
  });
  const markdown = contentMarkdown(content, 'https://example.test', 'ko');

  expect(markdown).toStartWith(
    '---\ntitle: "Title:\\ncanonical: malicious"\ncanonical: "https://example.test/2026/01/hello"',
  );
  expect(markdown).toContain('author: "Writer"');
  expect(markdown).toContain('categories: ["News"]');
  expect(markdown).toContain('lang: "ko"');
  const settings = {
    ...SEO_SETTINGS_DEFAULTS,
    siteUrl: 'https://example.test',
    webSubHub: 'https://hub.example/',
  };
  const site = { title: 'Site', description: 'Summary', locale: 'en' };
  const rss = await rssFeed(site as never, settings, [content]).text();

  expect(rss).toContain('<guid isPermaLink="false">urn:uuid:id-1</guid>');
  expect(rss).toContain(
    '<lastBuildDate>Fri, 02 Jan 2026 00:00:00 GMT</lastBuildDate>',
  );
  expect(rss).toContain(
    '<atom:updated>2026-01-02T00:00:00.000Z</atom:updated>',
  );
  expect(rss).toContain('href="https://hub.example/" rel="hub"');
  const sitemap = await sitemapChunk(
    settings.siteUrl,
    [
      {
        path: '/post',
        updatedAt: content.updatedAt,
        images: [{ url: 'https://example.test/image.png?a=1&b=2' }],
        alternates: [{ lang: 'ko', url: 'https://example.test/ko/post' }],
      },
    ],
    true,
    content.updatedAt,
  ).text();

  expect(sitemap).toContain(
    '<image:loc>https://example.test/image.png?a=1&amp;b=2</image:loc>',
  );
  expect(sitemap).toContain(
    'hreflang="ko" href="https://example.test/ko/post"',
  );
  expect(sitemap).toContain(
    '<loc>https://example.test/</loc><lastmod>2026-01-02T00:00:00.000Z</lastmod>',
  );
  const llms = llmsText(site as never, settings, [
    entry(),
    entry({ type: 'page', title: 'About' }),
  ]);

  expect(llms).toContain('## Pages\n\n- [About]');
  expect(llms).toContain('## Recent posts\n\n- [Hello]');
  expect(llms).toContain('## Optional\n\n- [Sitemap]');
});

test('the bounded corpus never reads protected summaries and rechecks bodies before publishing', async () => {
  const reads: string[] = [];
  const api = {
    list: async () => ({
      items: [
        entry({ protected: true }),
        entry({ path: '/changed' }),
        entry({ path: '/public' }),
        entry({ path: '/large' }),
      ],
      total: 4,
    }),
    resolvePath: async (path: string) => {
      reads.push(path);

      return {
        content: entry({
          path,
          protected: path === '/changed',
          html: path === '/large' ? 'x'.repeat(512000) : '<p>Readable</p>',
        }),
      };
    },
  } as never;
  const corpus = await loadCorpus(
    api,
    { ...SEO_SETTINGS_DEFAULTS, siteUrl: 'https://example.test' },
    'en',
  );

  expect(reads).not.toContain('/2026/01/hello');
  expect(corpus.text).toContain('canonical: "https://example.test/public"');
  expect(corpus.text).not.toContain('/changed');
  expect(corpus.text).not.toContain('/large');
  expect(new TextEncoder().encode(corpus.text).byteLength).toBeLessThanOrEqual(
    512000,
  );
});

test('full-text feeds read a few bodies at a time and never protected ones', async () => {
  let running = 0;
  let peak = 0;
  const read: string[] = [];
  const api = {
    resolvePath: async (path: string) => {
      read.push(path);
      peak = Math.max(peak, ++running);
      await Bun.sleep(1);
      running--;

      return { content: { html: '<p>Body</p>' }, redirect: false };
    },
  } as never;
  const items = Array.from({ length: 20 }, (_, index) =>
    entry({ id: `id-${index}`, path: `/p${index}`, protected: index === 0 }),
  );
  const bodies = await loadBodies(api, items, async () => null);

  expect(peak).toBeLessThanOrEqual(4);
  expect(read).toHaveLength(19);
  expect(read).not.toContain('/p0');
  expect(bodies.has('id-0')).toBe(false);
});
