// Regression guard: registered translations replace core text without breaking placeholders,
// escaping or pages, and unchanged maps are not requested again.
import { expect, test } from 'bun:test';
import { SEO_SETTINGS_DEFAULTS } from '@cms/sdk';
import { createContentClient } from '@cms/sdk/client';
import { messagesFor } from '#lib/i18n/admin.js';
import { ADMIN_PARAMS } from '#lib/i18n/admin-params.js';
import { createOverrideCache } from '#lib/i18n/override-cache.server.js';
import { applyOverrides } from '#lib/i18n/overrides.js';
import { loadSiteMessages } from '#lib/i18n/site.js';
import { siteCatalog } from '#lib/i18n/site.server.js';
import { buildSiteHead } from '#lib/seo/head.js';
import { seoSettingsView } from '#lib/server/public-view.js';

const publicMessages = async (overrides: Record<string, string>) =>
  loadSiteMessages(JSON.parse(JSON.stringify(siteCatalog('en-US', overrides))));

test('public overrides replace existing keys and interpolate the same parameters', async () => {
  const wire = JSON.stringify(
    siteCatalog('en-US', {
      themeReadMore: 'Keep reading',
      commentCount: '{count} replies',
      themeFeedTitle: '{name} from {site} ({unknown})',
      seoFocusKeyword: 'administration only',
      notACatalogKey: 'dropped',
    }),
  );
  const m = await publicMessages(JSON.parse(wire).overrides);
  const core = messagesFor('en-US');

  expect(wire).not.toContain('administration only');
  expect(wire).not.toContain('notACatalogKey');
  expect(m.themeReadMore).toBe('Keep reading');
  expect(m.commentCount(3)).toBe('3 replies');
  expect(m.themeFeedTitle('Site', 'Posts')).toBe('Posts from Site ({unknown})');
  expect(m.themeSearch).toBe(core.themeSearch);
  expect(m.themeResults(2)).toBe(core.themeResults(2));
});

test('administration overrides apply to the full catalog of the active language', () => {
  const m = applyOverrides(
    messagesFor('ko'),
    { pageOf: '{page} / {last}', signOut: 'Leave', apiError: 'ignored' },
    ADMIN_PARAMS,
    'ko',
  );

  expect(m.pageOf(2, 5)).toBe('2 / 5');
  expect(m.signOut).toBe('Leave');
  expect(m.apiError('Forbidden')).toBe(messagesFor('ko').apiError('Forbidden'));
  expect(m.signIn).toBe(messagesFor('ko').signIn);
});

test('override text and its parameters stay text and are escaped by the page head', async () => {
  const m = await publicMessages({ themeSearchResults: '</script>{query}' });
  const query = '<!--<b>';
  const head = buildSiteHead({
    messages: m,
    site: { title: 'Site', description: '', locale: 'en-US' },
    locale: 'en-US',
    settings: seoSettingsView({
      ...SEO_SETTINGS_DEFAULTS,
      siteUrl: 'https://example.test',
    }),
    page: { kind: 'search', query, posts: null },
  });

  expect(m.themeSearchResults(query)).toBe(`</script>${query}`);
  expect(head.jsonLd.match(/<\/script/gi)).toHaveLength(1);
  expect(head.jsonLd).not.toContain('<!--');
});

/** The API stand-in: version `v1` of the map, `304` for a matching `If-None-Match`. */
const api = (respond?: () => Promise<Response>) => {
  const requests: (string | null)[] = [];
  const fetcher = (async (_input, init) => {
    const match = new Headers(init?.headers).get('if-none-match');

    requests.push(match);
    if (respond) return respond();
    if (match === '"v1"') return new Response(null, { status: 304 });

    return Response.json(
      { locale: 'ko', messages: { signIn: '들어가기' } },
      { headers: { etag: '"v1"' } },
    );
  }) as typeof fetch;
  const read = (bounded: typeof fetch) =>
    createContentClient({
      baseUrl: 'http://api.test',
      fetch: bounded,
    }).i18n.messages('ko');

  return { requests, fetcher, read };
};

test('an unchanged version is served from the cache without extra requests', async () => {
  let clock = 0;
  const cached = createOverrideCache({ freshMs: 1000, now: () => clock });
  const { requests, fetcher, read } = api();

  const translation = { locale: 'ko', messages: { signIn: '들어가기' } };

  expect(await cached('site:ko', fetcher, read)).toEqual(translation);
  expect(await cached('site:ko', fetcher, read)).toEqual(translation);
  expect(requests).toEqual([null]);

  clock = 1000;
  expect(await cached('site:ko', fetcher, read)).toEqual(translation);
  expect(await cached('site:ko', fetcher, read)).toEqual(translation);
  expect(requests).toEqual([null, '"v1"']);
});

test('a failed or slow override call falls back to core messages', async () => {
  const failing = api(async () => Response.json({}, { status: 500 }));
  const slow = api(() => new Promise<Response>(() => {}));
  const cached = createOverrideCache({ timeoutMs: 20 });
  const started = Date.now();

  expect(await cached('site:a', failing.fetcher, failing.read)).toBeNull();
  expect(await cached('site:b', slow.fetcher, slow.read)).toBeNull();
  expect(Date.now() - started).toBeLessThan(1000);
  expect(await cached('site:a', failing.fetcher, failing.read)).toBeNull();
  expect(failing.requests).toHaveLength(1);
  expect((await publicMessages({})).signIn).toBe(messagesFor('en').signIn);
});
