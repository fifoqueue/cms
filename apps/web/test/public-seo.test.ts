// Regression guard: content text cannot break out of the JSON-LD script element.
import { expect, test } from 'bun:test';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  toPublicEntrySeo,
} from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import { buildHead } from '#lib/seo/head.js';
import type { Head, SitePage } from '#lib/seo/head.js';
import { contentView, seoSettingsView } from '#lib/server/public-view.js';

const site = { title: 'Site', description: 'About', locale: 'en-US' };
const settings = () =>
  seoSettingsView({
    ...SEO_SETTINGS_DEFAULTS,
    siteUrl: 'https://example.test',
  });
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

const graph = (head: Head) =>
  (
    JSON.parse(
      head.jsonLd.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''),
    ) as { '@graph': Record<string, unknown>[] }
  )['@graph'];

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
