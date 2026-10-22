// Regression guard for public metadata boundaries: JSON-LD cannot be broken out of, absolute
// URLs come only from the configured origin, and non-canonical pages stay out of the index.
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  toPublicEntrySeo,
} from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import { buildHead } from '#lib/seo/head.js';
import type { Head, SitePage } from '#lib/seo/head.js';
import {
  contentView,
  seoSettingsView,
  termArchiveView,
} from '#lib/server/public-view.js';

const site = { title: 'Site', description: 'About', locale: 'en-US' };
const ORIGIN = 'https://example.test';
const settings = (siteUrl = ORIGIN, extra = {}) =>
  seoSettingsView({ ...SEO_SETTINGS_DEFAULTS, siteUrl, ...extra });
const seo = toPublicEntrySeo(DEFAULT_ENTRY_SEO);

const entry = (fields: Partial<PublicContent> = {}): SitePage => ({
  kind: 'content',
  content: contentView({
    id: 'c1',
    type: 'post',
    slug: 'cafe',
    path: '/2026/01/caf%C3%A9',
    title: 'Café',
    excerpt: 'Excerpt',
    html: '<p>Body</p>',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    categories: [{ id: 'k1', name: 'News', slug: 'news' }],
    tags: [],
    extraTerms: [],
    seo,
    meta: {},
    ...fields,
  }),
});

const archive = (
  taxonomy: 'category' | 'tag',
  page: number,
  total: number,
): SitePage => ({
  kind: 'term',
  term: termArchiveView({
    id: 't1',
    taxonomy,
    name: 'News',
    slug: 'news',
    description: '',
    parentId: null,
    count: total,
    seo,
  }),
  posts: { items: [], total, page, pageSize: 10 },
});

const link = (head: Head, rel: string, type?: string) =>
  head.links.find((item) => item.rel === rel && item.type === type)?.href;
const robots = (head: Head) =>
  head.meta.find((tag) => tag.name === 'robots')?.content;
const graph = (head: Head) =>
  (
    JSON.parse(
      head.jsonLd.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''),
    ) as { '@graph': Record<string, unknown>[] }
  )['@graph'];

describe('public metadata', () => {
  test('content text cannot end the JSON-LD script element', () => {
    const title = '</script><script>alert(1)</script><!--';
    const head = buildHead({
      site,
      settings: settings(),
      page: entry({ title, seo: { ...seo, authorName: '</SCRIPT>' } }),
    });

    expect(head.jsonLd.match(/<\/script/gi)).toHaveLength(1);
    expect(head.jsonLd.endsWith('</script>')).toBe(true);
    expect(graph(head)).toContainEqual(
      expect.objectContaining({
        '@type': 'BlogPosting',
        headline: title,
        author: { '@type': 'Person', name: '</SCRIPT>' },
      }),
    );
  });

  test('absolute URLs use only the configured origin and the permalink path', () => {
    const unset = buildHead({ site, settings: settings(''), page: entry() });
    expect(link(unset, 'canonical')).toBeUndefined();
    expect(unset.meta.some((tag) => tag.property === 'og:url')).toBe(false);
    expect(graph(unset).map((node) => node['@id'])).toEqual([
      '_:website',
      '_:organization',
      '_:webpage',
      '_:article',
    ]);
    expect(link(unset, 'alternate', 'text/markdown')).toBe('/cafe.md');

    const head = buildHead({ site, settings: settings(), page: entry() });
    expect(link(head, 'canonical')).toBe(`${ORIGIN}/2026/01/caf%C3%A9`);
    expect(link(head, 'alternate', 'text/markdown')).toBe(`${ORIGIN}/cafe.md`);
    expect(graph(head)).toContainEqual(
      expect.objectContaining({
        '@type': 'BreadcrumbList',
        itemListElement: [
          expect.objectContaining({ item: `${ORIGIN}/` }),
          expect.objectContaining({ item: `${ORIGIN}/category/news` }),
          expect.objectContaining({ item: `${ORIGIN}/2026/01/caf%C3%A9` }),
        ],
      }),
    );

    const hidden = buildHead({
      site,
      settings: settings(),
      page: entry({ seo: { ...seo, noIndex: true } }),
    });
    expect(robots(hidden)).toBe('noindex, follow');
    expect(link(hidden, 'alternate', 'text/markdown')).toBeUndefined();
  });

  test('search, archive pages and empty archives get the right canonical and robots', () => {
    const search = buildHead({
      site,
      settings: settings(),
      page: {
        kind: 'search',
        query: 'x',
        posts: { items: [], total: 0, page: 1, pageSize: 10 },
      },
    });
    expect(robots(search)).toBe('noindex, follow');
    expect(link(search, 'canonical')).toBeUndefined();

    const paged = buildHead({
      site,
      settings: settings(),
      page: archive('category', 2, 25),
    });
    expect(robots(paged)).toStartWith('index, follow');
    expect(link(paged, 'canonical')).toBe(`${ORIGIN}/category/news?page=2`);
    expect(link(paged, 'prev')).toBe(`${ORIGIN}/category/news`);
    expect(link(paged, 'next')).toBe(`${ORIGIN}/category/news?page=3`);

    for (const page of [archive('category', 1, 0), archive('tag', 1, 5)])
      expect(
        robots(
          buildHead({
            site,
            settings: settings(ORIGIN, { indexTags: false }),
            page,
          }),
        ),
      ).toBe('noindex, follow');
  });
});
