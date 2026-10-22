// Regression guard for crawler and agent discovery: crawl policy, escaping of generated XML and
// Markdown, and that only discoverable public entries are exposed, linked by canonical path.
import { describe, expect, test } from 'bun:test';
import type { PublicContent, PublicSeoSettings } from '@cms/sdk';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  toPublicEntrySeo,
} from '@cms/sdk';
import { contentMarkdown } from '#lib/server/markdown.js';
import {
  isDiscoverable,
  llmsTxt,
  markdownResponse,
  robotsTxt,
  rssFeed,
  sitemapChunk,
  sitemapIndex,
} from '#lib/server/seo-discovery.js';

const ORIGIN = 'https://example.test';
const settings = (overrides: Partial<PublicSeoSettings> = {}) =>
  ({
    ...SEO_SETTINGS_DEFAULTS,
    siteUrl: ORIGIN,
    ...overrides,
  }) as PublicSeoSettings;

const site = { title: 'Site & <Co>', description: 'About', locale: 'en' };

const publicSeo = toPublicEntrySeo(DEFAULT_ENTRY_SEO);
const entry = (overrides: Partial<PublicContent> = {}): PublicContent => ({
  id: 'id-1',
  type: 'post',
  slug: 'hello',
  path: '/2026/01/hello',
  title: 'Hello </title><script>alert(1)</script> [x](javascript:alert(1))',
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

const robotsGroups = async (policy: PublicSeoSettings) => {
  const text = await robotsTxt(policy).text();
  return Object.fromEntries(
    text
      .split('\n\n')
      .filter((group) => group.startsWith('User-agent: '))
      .map((group) => {
        const [agent = '', ...rules] = group.split('\n');
        return [agent.slice('User-agent: '.length), rules];
      }),
  );
};

describe('crawl policy', () => {
  test('robots keeps private paths out for every allowed group and separates AI search from training', async () => {
    const groups = await robotsGroups(settings());
    const privateRules = [
      'Disallow: /admin$',
      'Disallow: /admin/',
      'Disallow: /api/',
    ];
    // Search crawlers must reach noindex pages to read the noindex.
    expect(groups['*']).toEqual([...privateRules, 'Allow: /']);
    // A named group replaces `*`, so it has to repeat the private rules.
    expect(groups['OAI-SearchBot']).toEqual([...privateRules, 'Allow: /']);
    expect(groups.GPTBot).toEqual(['Disallow: /']);
    expect(await robotsTxt(settings()).text()).toContain(
      `Sitemap: ${ORIGIN}/sitemap.xml`,
    );

    const closed = await robotsGroups(settings({ indexingEnabled: false }));
    expect(closed['*']).toEqual([...privateRules, 'Allow: /']);
    expect(closed['OAI-SearchBot']).toEqual(['Disallow: /']);
    expect(await robotsTxt(settings({ siteUrl: '' })).text()).not.toContain(
      'Sitemap:',
    );
  });

  test('noindex entries, canonicals elsewhere and disabled indexing are not discoverable', () => {
    const policy = settings();
    expect(isDiscoverable(entry(), policy)).toBe(true);
    expect(
      isDiscoverable(
        entry({
          seo: { ...publicSeo, canonicalUrl: `${ORIGIN}/2026/01/hello` },
        }),
        policy,
      ),
    ).toBe(true);
    expect(
      isDiscoverable(entry({ seo: { ...publicSeo, noIndex: true } }), policy),
    ).toBe(false);
    expect(
      isDiscoverable(
        entry({ seo: { ...publicSeo, canonicalUrl: 'https://other.test/x' } }),
        policy,
      ),
    ).toBe(false);
    expect(isDiscoverable(entry(), settings({ indexingEnabled: false }))).toBe(
      false,
    );
  });
});

describe('generated documents', () => {
  test('sitemap and feed escape text, keep encoded canonical paths and drop invalid XML characters', async () => {
    const sitemap = await sitemapChunk(
      ORIGIN,
      [{ path: '/caf%C3%A9?a=1&b=<2>', updatedAt: 'not a date' }],
      true,
    ).text();
    expect(sitemap).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(sitemap).toContain(
      `<loc>${ORIGIN}/caf%C3%A9?a=1&amp;b=&lt;2&gt;</loc></url>`,
    );

    const index = await sitemapIndex(ORIGIN, {
      content: 0,
      category: 1001,
      tag: 0,
    }).text();
    expect(index).toContain(`<loc>${ORIGIN}/sitemaps/content/1.xml</loc>`);
    expect(index).toContain(`<loc>${ORIGIN}/sitemaps/category/2.xml</loc>`);
    expect(index).not.toContain('/sitemaps/tag/');
    // Rejected from the counts alone, before any chunk list is built.
    expect(() =>
      sitemapIndex(ORIGIN, { content: 1e15, category: 0, tag: 0 }),
    ).toThrow('Sitemap index would exceed 50000 sitemaps');

    const feed = await rssFeed(site, settings(), [
      entry({ excerpt: 'bad\u0000char ]]>' }),
    ]).text();
    expect(feed).not.toContain('<script>');
    expect(feed).not.toContain('\u0000');
    expect(feed).toContain('<title>Site &amp; &lt;Co&gt;</title>');
    expect(feed).toContain(`<link>${ORIGIN}/2026/01/hello</link>`);
    expect(feed).toContain('<description>badchar ]]&gt;</description>');
    expect(feed).toContain('<pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>');
  });

  test('llms.txt titles cannot inject links and point at Markdown alternates', async () => {
    const text = await llmsTxt(site, settings(), [entry()]).text();
    expect(text).toContain(`](${ORIGIN}/hello.md)`);
    expect(text).toContain(`[Sitemap](${ORIGIN}/sitemap.xml)`);
    expect(text).not.toContain('[x](javascript');
    expect(text).not.toContain('<script>');
  });

  test('Markdown keeps readable structure and drops scripts, unsafe links and injected markup', async () => {
    const html = [
      '<h2>Intro <em>here</em></h2>',
      '<p># not a heading <a href="javascript:alert(1)">bad</a> <a href="../docs">docs</a></p>',
      '<script>alert("x")</script><style>p{}</style>',
      '<ul><li><p>one</p></li><li><p>two</p><ol><li><p>nested</p></li></ol></li></ul>',
      '<pre><code class="language-js">const a = "```";\n</code></pre>',
      '<p><img src="/a b.png" alt="pic](javascript:x)"> <code>x</code></p>',
    ].join('');
    const markdown = contentMarkdown(
      entry({
        title: 'Hello',
        html,
        seo: { ...publicSeo, authorName: 'Ann', authorUrl: 'https://ann.test' },
      }),
      ORIGIN,
    );

    expect(markdown).toContain('## Intro *here*');
    expect(markdown).toContain(
      `\\# not a heading bad [docs](${ORIGIN}/2026/docs)`,
    );
    expect(markdown).toContain('- one\n- two\n  1. nested');
    expect(markdown).toContain('````js\nconst a = "```";\n````');
    expect(markdown).toContain(`![pic\\](javascript:x)](${ORIGIN}/a%20b.png)`);
    expect(markdown).toContain(
      `- Canonical: [${ORIGIN}/2026/01/hello](${ORIGIN}/2026/01/hello)`,
    );
    expect(markdown).toContain('- Author: [Ann](https://ann.test/)');
    expect(markdown).not.toMatch(/alert|<script|<style|\(javascript:alert/);

    const response = markdownResponse(entry(), settings());
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8',
    );
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('link')).toBe(
      `<${ORIGIN}/2026/01/hello>; rel="canonical", <${ORIGIN}/llms.txt>; rel="describedby"; type="text/plain"`,
    );
  });
});
