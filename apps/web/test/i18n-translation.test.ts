// Regression guard: overrides are requested for a supported catalog language, administration
// translations never cross users, and the locale the API chooses decides the page's copy.
import { expect, test } from 'bun:test';

// SvelteKit provides these at build time (same values as `page-data.test.ts`).
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

const { adminTranslation, siteTranslation } =
  await import('#lib/i18n/overrides.server.js');
const { loadSiteMessages } = await import('#lib/i18n/site.js');
const { siteCatalog } = await import('#lib/i18n/site.server.js');

/** The API stand-in: answers each request with `answer(locale, token)` and records the request. */
const api = (
  answer: (
    locale: string,
    token: string | null,
  ) => { locale: string; messages: Record<string, string> },
) => {
  const requests: { locale: string; token: string | null }[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const locale = url.searchParams.get('locale')!;
    const token = new Headers(init?.headers)
      .get('authorization')
      ?.replace(/^Bearer /, '');

    requests.push({ locale, token: token ?? null });

    if (!/^(en|ko)$/.test(locale))
      return Response.json({ error: 'ValidationFailed' }, { status: 400 });

    return Response.json(answer(locale, token ?? null), {
      headers: { etag: `"${locale}"` },
    });
  }) as typeof fetch;

  return { requests, fetcher };
};

const adminEvent = (fetcher: typeof fetch, token: string) => ({
  fetch: fetcher,
  locals: { token } as App.Locals,
  request: new Request('http://web.test/admin'),
  getClientAddress: () => '127.0.0.1',
});

test('a regional site locale requests its catalog language and keeps the regional tag', async () => {
  const { requests, fetcher } = api((locale) => ({
    locale,
    messages: { themeReadMore: 'Keep reading' },
  }));

  const first = await siteTranslation(fetcher, 'en-US');
  const second = await siteTranslation(fetcher, 'en-GB');

  expect(requests.map(({ locale }) => locale)).toEqual(['en']);
  expect(first).toEqual({
    locale: 'en-US',
    messages: { themeReadMore: 'Keep reading' },
  });
  expect(second.locale).toBe('en-GB');
});

test('the locale the API chooses selects the core copy the overrides apply to', async () => {
  const { fetcher } = api(() => ({
    locale: 'en',
    messages: { themeReadMore: 'Continue' },
  }));

  const translation = await siteTranslation(fetcher, 'ko-KR');
  const m = await loadSiteMessages(
    siteCatalog(translation.locale, translation.messages),
  );

  expect(translation.locale).toBe('en');
  expect(m.themeReadMore).toBe('Continue');
  expect(m.themeSearch).toBe('Search');
});

test('administration translations are cached per user', async () => {
  const { requests, fetcher } = api((locale, token) =>
    token === 'a'
      ? { locale: 'ko', messages: { signOut: '나가기' } }
      : { locale, messages: { signOut: 'Leave' } },
  );

  const a = await adminTranslation(adminEvent(fetcher, 'a'), 'user-a', 'en');
  const b = await adminTranslation(adminEvent(fetcher, 'b'), 'user-b', 'en');

  expect(a).toEqual({ locale: 'ko', messages: { signOut: '나가기' } });
  expect(b).toEqual({ locale: 'en', messages: { signOut: 'Leave' } });

  await adminTranslation(adminEvent(fetcher, 'a'), 'user-a', 'en-US');
  await adminTranslation(adminEvent(fetcher, 'b'), 'user-b', 'en');

  expect(requests).toEqual([
    { locale: 'en', token: 'a' },
    { locale: 'en', token: 'b' },
  ]);
});
