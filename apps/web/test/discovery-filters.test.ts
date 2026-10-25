// Regression guard for plugin discovery filters: filtered values replace the generated ones but
// are escaped afterwards, unavailable filtering falls back to the unfiltered value, and sitemap
// indexes follow whatever provider kinds the API registers. Fake API responses only.
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  toPublicEntrySeo,
} from '@cms/sdk';
import type { PublicContent, PublicSeoSettings } from '@cms/sdk';
import { buildHead, headMeta } from '#lib/seo/head.js';
import type { SitePage } from '#lib/seo/head.js';
import { contentView, seoSettingsView } from '#lib/server/public-view.js';
import {
  feedValues,
  rssFeed,
  sitemapIndex,
} from '#lib/server/seo-discovery.js';
import { capabilityGroups, rolePlugin } from '#lib/admin/capability-groups.js';

// The filter module builds SDK clients; SvelteKit provides their environment at build time.
Bun.plugin({
  name: 'sveltekit-env',
  setup(build) {
    build.module('$app/env/private', () => ({
      exports: {
        CMS_API_URL: 'http://cms.test',
        API_PORT: '4000',
        CMS_FRONTEND_SECRET: '',
        OIDC_FRONTEND_SECRET: '',
      },
      loader: 'object',
    }));
  },
});
const { filterWith } = await import('#lib/server/seo-filter.js');

const ORIGIN = 'https://example.test';
const proof = { address: '203.0.113.7', secret: 'frontend-secret' };
const seo = toPublicEntrySeo(DEFAULT_ENTRY_SEO);
const site = { title: 'Site', description: 'About', locale: 'en' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const apiError = (status: number, code: string) =>
  json({ error: { code, message: code } }, status);

/** A fake API answering the filter RPC with `respond`, recording each request. */
const fakeApi = (respond: (init: RequestInit) => Promise<Response>) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return respond(init);
  }) as typeof fetch;
  return { calls, fetcher };
};

describe('filter RPC', () => {
  test('one proved call carries every kind and returns the filtered values in order', async () => {
    const { calls, fetcher } = fakeApi(async () =>
      json(['robots: changed', 'llms']),
    );
    const result = await filterWith(fetcher, proof, [
      { kind: 'robots.txt', value: 'robots' },
      { kind: 'llms.txt', value: 'llms' },
    ] as const);
    expect(result).toEqual(['robots: changed', 'llms']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://cms.test/api/v1/seo/filter');
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  test('every failed filter call and a missing proof keep the unfiltered value', async () => {
    for (const respond of [
      async () => apiError(400, 'invalid_input'),
      async () => apiError(403, 'forbidden'),
      async () => apiError(413, 'payload_too_large'),
      async () => apiError(429, 'rate_limited'),
      async () => apiError(503, 'unavailable'),
      // Plugin output that fails the kind's schema: the SDK rejects it as invalid.
      async () => json([{ not: 'text' }]),
      async () => json(['too', 'many']),
      async () => {
        throw new TypeError('fetch failed');
      },
    ]) {
      const { fetcher } = fakeApi(respond);
      expect(
        await filterWith(fetcher, proof, [{ kind: 'robots.txt', value: 'x' }]),
      ).toEqual(['x']);
    }
    const { calls, fetcher } = fakeApi(async () => json(['never']));
    expect(
      await filterWith(fetcher, undefined, [{ kind: 'llms.txt', value: 'y' }]),
    ).toEqual(['y']);
    expect(calls).toHaveLength(0);
  });

  test('a hung API, or a response body that never ends, is abandoned at the deadline', async () => {
    const hung = fakeApi(
      (init) =>
        new Promise((_, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(init.signal!.reason),
          ),
        ),
    );
    const started = performance.now();
    expect(
      await filterWith(
        hung.fetcher,
        proof,
        [{ kind: 'robots.txt', value: 'x' }],
        30,
      ),
    ).toEqual(['x']);
    expect(performance.now() - started).toBeLessThan(1000);

    // Headers arrive, the body stalls: the same deadline covers reading it.
    const stalled = fakeApi(async (init) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('["x'));
          init.signal!.addEventListener('abort', () =>
            controller.error(init.signal!.reason),
          );
        },
      });
      return new Response(body, {
        headers: { 'content-type': 'application/json' },
      });
    });
    expect(
      await filterWith(
        stalled.fetcher,
        proof,
        [{ kind: 'robots.txt', value: 'y' }],
        30,
      ),
    ).toEqual(['y']);
  });
});

describe('filtered output', () => {
  const settings = {
    ...SEO_SETTINGS_DEFAULTS,
    siteUrl: ORIGIN,
  } as PublicSeoSettings;
  const entry = (id: string, title: string) =>
    ({
      id,
      type: 'post',
      slug: id,
      path: `/${id}`,
      title,
      excerpt: 'Excerpt',
      publishedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      categories: [{ id: 'k1', name: 'News', slug: 'news' }],
      tags: [],
      seo,
      meta: {},
    }) as unknown as PublicContent;

  test('feeds serialize filtered channels and items, escaped, keeping terms by id', async () => {
    const items = [entry('a', 'First'), entry('b', 'Second')];
    const values = feedValues(site, settings, items);
    expect(values.items.map((item) => item.link)).toEqual([
      `${ORIGIN}/a`,
      `${ORIGIN}/b`,
    ]);
    const feed = await rssFeed(site as never, settings, items, {
      filtered: {
        channel: { ...values.channel, title: 'Plugin <channel>' },
        items: [
          { ...values.items[1]!, title: 'Second </title><x>' },
          {
            id: 'extra',
            title: 'Added',
            link: `${ORIGIN}/extra`,
            description: 'From a plugin',
            publishedAt: 'not a date',
          },
        ],
      },
    }).text();
    expect(feed).toContain('<title>Plugin &lt;channel&gt;</title>');
    expect(feed).toContain('<title>Second &lt;/title&gt;&lt;x&gt;</title>');
    expect(feed).not.toContain(`${ORIGIN}/a<`);
    expect(feed.match(/<category>News<\/category>/g)).toHaveLength(1);
    expect(feed).toContain(`<link>${ORIGIN}/extra</link>`);
    expect(feed.match(/<pubDate>/g)).toHaveLength(1);
  });

  test('page meta applies the filter result and still escapes JSON-LD', () => {
    const page: SitePage = {
      kind: 'content',
      content: contentView({
        ...entry('c1', 'Café'),
        html: '<p>Body</p>',
        extraTerms: [],
      } as PublicContent),
    };
    const input = {
      site,
      settings: seoSettingsView({ ...SEO_SETTINGS_DEFAULTS, siteUrl: ORIGIN }),
      page,
    };
    const value = headMeta(input);
    expect(value.canonicalUrl).toBe(`${ORIGIN}/c1`);
    expect(value.og['og:title']).toBe('Café');
    const head = buildHead({
      ...input,
      filtered: {
        ...value,
        title: 'Filtered',
        description: 'Filtered description',
        canonicalUrl: `${ORIGIN}/elsewhere`,
        og: { ...value.og, 'og:title': 'Shared' },
        jsonLd: [{ '@type': 'Thing', name: '</script><script>x()' }],
      },
    });
    expect(head.title).toBe('Filtered');
    expect(head.meta).toContainEqual({
      name: 'description',
      content: 'Filtered description',
    });
    expect(head.meta).toContainEqual({
      property: 'og:title',
      content: 'Shared',
    });
    expect(head.links.filter((link) => link.rel === 'canonical')).toEqual([
      { rel: 'canonical', href: `${ORIGIN}/elsewhere` },
    ]);
    expect(head.jsonLd.match(/<\/script/gi)).toHaveLength(1);
    // Unfiltered pages build the same head as before.
    expect(buildHead({ ...input, filtered: null })).toEqual(buildHead(input));
  });

  test('sitemap indexes list every registered provider kind', async () => {
    const index = await sitemapIndex(ORIGIN, {
      content: 1,
      category: 0,
      'gallery-albums': 1001,
    }).text();
    expect(index).toContain(`${ORIGIN}/sitemaps/content/1.xml`);
    expect(index).toContain(`${ORIGIN}/sitemaps/gallery-albums/2.xml`);
    expect(index).not.toContain('/sitemaps/category/');
  });
});

describe('capability catalog', () => {
  test('plugin capabilities group by source; held but unregistered ones are kept', () => {
    const groups = capabilityGroups(
      [
        { key: 'content.create', label: 'Create', source: 'core' },
        { key: 'shop.orders', label: 'Manage orders', source: 'shop' },
        { key: 'forms.view', label: 'View entries', source: 'forms' },
      ],
      [{ capabilities: ['content.create', 'shop.orders', 'old.thing'] }],
      ['content.create'],
    );
    expect(groups).toEqual([
      {
        source: 'forms',
        capabilities: [{ key: 'forms.view', label: 'View entries' }],
      },
      {
        source: 'shop',
        capabilities: [{ key: 'shop.orders', label: 'Manage orders' }],
      },
      {
        source: null,
        capabilities: [{ key: 'old.thing', label: 'old.thing' }],
      },
    ]);
    expect(capabilityGroups(null, [], ['content.create'])).toEqual([]);
    expect([
      rolePlugin('shop'),
      rolePlugin('core'),
      rolePlugin('admin'),
    ]).toEqual(['shop', null, null]);
  });
});
