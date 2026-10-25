// Regression guard for the public/admin page-data boundary: what loaders and form actions
// serialize to the browser. Sentinel values must never appear in returned data.
import { beforeEach, describe, expect, test } from 'bun:test';
import { isActionFailure } from '@sveltejs/kit';
import { with_request_store } from '@sveltejs/kit/internal/server';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  toPublicEntrySeo,
} from '@cms/sdk';

// SvelteKit provides `$app/env/private` at build time; point the SDK clients at a fake API.
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
    build.module('$app/paths', () => ({
      exports: { resolve: (path: string) => path, match: async () => null },
      loader: 'object',
    }));
  },
});

const { load: loadSiteLayout } =
  await import('#web/routes/(site)/+layout.server.js');
const { handle: handleRequest } = await import('#web/hooks.server.js');
const { load: loadHome, actions: homeActions } =
  await import('#web/routes/(site)/+page.server.js');
const { load: loadEntry, actions: entryActions } =
  await import('#web/routes/(site)/[slug]/+page.server.js');
const { load: loadCategory } =
  await import('#web/routes/(site)/category/[slug]/+page.server.js');
const { actions: categoryActions } =
  await import('#web/routes/admin/(app)/categories/+page.server.js');
const { actions: newContentActions } =
  await import('#web/routes/admin/(app)/content/new/+page.server.js');
const { actions: editContentActions } =
  await import('#web/routes/admin/(app)/content/[id]/+page.server.js');
const { actions: appearanceActions } =
  await import('#web/routes/admin/(app)/appearance/+page.server.js');
const { removeApiSecrets } = await import('#web-env');
const { GET: feed } = await import('#web/routes/feed.xml/+server.js');
const { GET: oembed } = await import('#web/routes/oembed/+server.js');
const { loadBlockData } = await import('#lib/server/theme-queries.js');
const { contentApi } = await import('#lib/server/api.js');
const { actions: editorActions } =
  await import('#web/routes/admin/(app)/appearance/editor/+page.server.js');

const { commentAction } = await import('#lib/server/comments.js');

const { load: loadAuthLayout } =
  await import('#web/routes/admin/(auth)/+layout.server.js');
const { load: loadPasswordPage } =
  await import('#web/routes/admin/(auth)/password/+page.server.js');

const { load: loadPrivacy, actions: privacyActions } =
  await import('#web/routes/privacy/confirm/+page.server.js');

const SECRET = 'SECRET-SENTINEL-7f3a';
const TOKEN = 'TOKEN-SENTINEL-91c2';

const publicSeo = toPublicEntrySeo(DEFAULT_ENTRY_SEO);

const content = (slug: string, type: 'post' | 'page' = 'post') => ({
  id: `id-${slug}`,
  type,
  slug,
  path: `/${slug}`,
  title: `Title ${slug}`,
  excerpt: 'Excerpt',
  html: '<p>Body</p>',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  categories: [{ id: 'c1', name: 'News', slug: 'news' }],
  tags: [{ id: 't1', name: 'Tips', slug: 'tips' }],
  extraTerms: [],
  author: { name: 'Ann', slug: 'ann' },
  sticky: false,
  commentCount: 0,
  protected: false,
  featuredImage: null,
  fields: {},
  seo: publicSeo,
  // Public plugin data, but no view uses it, so page data never carries it.
  meta: { plugin: SECRET },
});

const theme = {
  id: 'paper',
  name: 'Paper',
  version: '1.0.0',
  settings: {
    palette: [
      ['base', '#ffffff'],
      ['surface', '#f5f5f5'],
      ['contrast', '#111111'],
      ['muted', '#666666'],
      ['accent', '#0055ff'],
      ['border', '#dddddd'],
    ].map(([slug, color]) => ({ slug, name: slug, color })),
    fontFamilies: [
      { slug: 'body', name: 'Body', fontFamily: 'Inter, sans-serif' },
    ],
    layout: { contentSize: '42rem', wideSize: '72rem' },
  },
  styles: {
    fontFamily: 'body',
    headingFontFamily: '',
    fontSize: 'medium',
    lineHeight: 'normal',
    radius: 'medium',
  },
  templates: { index: [] },
  parts: [],
  css: '',
  preview: false,
};

const reading = {
  frontPage: 'posts',
  frontPageId: null,
  postsPageId: null,
  postsPerPage: 10,
  feedItems: 20,
  dateFormat: 'long',
  timeZone: 'UTC',
  cacheSeconds: 0,
  frontPagePath: null,
  postsPagePath: null,
};

interface Call {
  method: string;
  url: URL;
  authorization: string | null;
  commenterProof: string | null;
  body: string;
}

let calls: Call[] = [];
let override: ((call: Call) => Response | undefined) | undefined;

const json = (body: unknown, status = 200) => Response.json(body, { status });

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const call = {
    method: request.method,
    url: new URL(request.url),
    authorization: request.headers.get('authorization'),
    commenterProof: request.headers.get('x-cms-commenter-proof'),
    body: await request.text(),
  };
  calls.push(call);
  const custom = override?.(call);
  if (custom) return custom;
  switch (call.url.pathname) {
    case '/api/v1/privacy':
      return json({ policy: null, commentCookies: true });
    case '/api/v1/comments':
      if (call.method === 'GET')
        return json({
          items: [],
          total: 0,
          count: 0,
          page: Number(call.url.searchParams.get('page') ?? 1),
          pageSize: 50,
          open: true,
          threadDepth: 3,
          truncated: false,
        });
      break;
    case '/api/v1/site':
      return json({ title: 'Site', description: '', locale: 'en' });
    case '/api/v1/auth/status':
      return json({ setupRequired: false });
    case '/api/v1/auth/sso':
      return json({ providers: [] });
    case '/api/v1/auth/sign-in':
      return json({
        methods: [
          {
            id: 'password',
            label: 'Password',
            options: [],
            fields: [
              { name: 'email', label: 'Email', type: 'email' },
              { name: 'password', label: 'Password', type: 'password' },
            ],
          },
          {
            id: 'plugin:magic:link',
            label: 'Magic link',
            options: [{ id: 'mail', label: 'Email me', secret: SECRET }],
            fields: [],
          },
        ],
        setup: [],
        passwordReset: true,
      });
    case '/api/v1/auth/register':
      return json({ enabled: false });
    case '/api/v1/security/captcha':
      return json({ provider: 'none', siteKey: '', always: [] });
    case '/api/v1/layout':
      return json({
        site: { title: 'Site', description: '', locale: 'en' },
        seo: SEO_SETTINGS_DEFAULTS,
        theme,
        reading,
        menus: { primary: null, footer: null },
        widgets: { sidebar: [], footer: [] },
      });
    case '/api/v1/seo':
      return json(SEO_SETTINGS_DEFAULTS);
    case '/api/v1/resolve': {
      const path = call.url.searchParams.get('path');
      if (path === '/hello')
        return json({ content: content('hello'), redirect: false });
      if (path === '/search')
        return json({ content: content('search', 'page'), redirect: false });
      if (path === '/2025/old')
        return json({
          content: { ...content('moved'), path: '/2026/moved' },
          redirect: true,
        });
      break;
    }
    case '/api/v1/theme':
      return json(theme);
    case '/api/v1/reading':
      return json(reading);
    case '/api/v1/menus/primary':
    case '/api/v1/menus/footer':
      return json(null);
    case '/api/v1/widgets':
      return json({ sidebar: [], footer: [] });
    case '/api/v1/content-types':
      return json([]);
    case '/api/v1/admin/content-types':
      return json({
        types: ['post', 'article', 'page'].map((key) => ({
          key,
          name: key,
          pluralName: key,
          description: '',
          archive: false,
          searchable: true,
          supports: {
            categories: true,
            tags: true,
            comments: true,
            featuredImage: true,
          },
          builtin: true,
        })),
        fields: [],
      });
    case '/api/v1/slots':
      return json({
        head: [],
        'site.header': [],
        'site.footer': [],
        'content.before': [],
        'content.after': [],
        'comments.before': [],
        'comments.after': [],
      });
    case '/api/v1/taxonomies/category':
      return json([
        {
          id: 'c1',
          taxonomy: 'category',
          name: 'News',
          slug: 'news',
          description: '',
          parentId: null,
          count: 1,
          seo: publicSeo,
        },
      ]);
    case '/api/v1/taxonomies/category/news':
      return json({
        id: 'c1',
        taxonomy: 'category',
        name: 'News',
        slug: 'news',
        description: '',
        parentId: null,
        count: 2,
        seo: publicSeo,
      });
    case '/api/v1/content': {
      const type = call.url.searchParams.get('type');
      // List items carry no body.
      const items = [content('hello'), content('about', 'page')]
        .filter((item) => !type || item.type === type)
        .filter(
          (item) =>
            !call.url.searchParams.has('sticky') ||
            item.sticky === (call.url.searchParams.get('sticky') === 'only'),
        )
        .map(({ html: _html, fields: _fields, ...item }) => item);
      return json({
        items,
        total: items.length,
        page: 1,
        pageSize: 10,
      });
    }
    case '/api/v1/content/hello':
      return json(content('hello'));
    case '/api/v1/content/search':
      return json(content('search', 'page'));
  }
  return json({ error: { code: 'not_found', message: 'Not found' } }, 404);
}) as typeof fetch;

/** Throws on any access, so a public loader touching session state fails the test. */
const forbidden = (name: string) =>
  new Proxy(
    {},
    {
      get(_, key) {
        throw new Error(`public loader read ${name}.${String(key)}`);
      },
    },
  );

const publicLocals = () =>
  new Proxy(
    { token: null as string | null },
    {
      get(target, key) {
        if (key === 'token') return target.token;
        throw new Error(`public loader read locals.${String(key)}`);
      },
    },
  );

const publicEvent = (
  path: string,
  params: Record<string, string> = {},
  route = '/(site)',
  loginPath = '/login',
) =>
  ({
    fetch: fakeFetch,
    url: new URL(path, 'http://web.test'),
    route: { id: route },
    params,
    locals: publicLocals(),
    setHeaders: () => undefined,
    // Public entry reads may forward visitor proofs and an optional session to the API.
    cookies: { getAll: () => [], get: () => undefined },
    parent: async () => ({
      reading,
      theme,
      site: {
        title: 'Site',
        description: '',
        locale: 'en',
        icon: null,
        logo: null,
        loginPath,
        showLogin: true,
      },
      archives: {
        bases: { category: '/category', tag: '/tag' },
        history: { category: [], tag: [] },
      },
    }),
  }) as never;

const adminEvent = (
  path: string,
  form: Record<string, string | string[] | File>,
  params: Record<string, string> = {},
) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(form))
    for (const item of Array.isArray(value) ? value : [value])
      body.append(key, item);
  const url = new URL(path, 'http://web.test');
  return {
    fetch: fakeFetch,
    url,
    params,
    setHeaders: () => undefined,
    request: new Request(url, { method: 'POST', body }),
    locals: {
      token: TOKEN,
      user: { id: 'u1', email: `${SECRET}@example.test`, name: 'Admin' },
    },
  } as never;
};

const failureData = (result: unknown) => {
  expect(isActionFailure(result)).toBe(true);
  return (result as { data: Record<string, unknown> }).data;
};

beforeEach(() => {
  calls = [];
  override = undefined;
});

describe('public page data', () => {
  test('the web runtime drops API-only secrets', () => {
    const env = {
      DATABASE_URL: 'mysql://secret',
      CMS_SECRET_KEY: SECRET,
      CMS_SECRET_KEY_PREVIOUS: `${SECRET}-previous`,
      CMS_EGRESS_ALLOWLIST: '[{"host":"internal"}]',
      CMS_API_URL: 'http://api',
    };
    removeApiSecrets(env);

    expect(env).toEqual({ CMS_API_URL: 'http://api' });
  });

  test('uses the anonymous public API only and drops fields no view needs', async () => {
    const pages = [
      // Reading `url` or `route` would re-run the layout on every navigation.
      await loadSiteLayout({
        ...(publicEvent('/') as object),
        url: forbidden('url'),
        route: forbidden('route'),
      } as never),
      await loadHome(publicEvent('/')),
      await loadEntry(publicEvent('/hello', { slug: 'hello' })),
      await loadHome(publicEvent('/?q=hello&page=2')),
      await loadCategory(publicEvent('/category/news', { slug: 'news' })),
      await loadEntry(publicEvent('/search', { slug: 'search' })),
    ];

    // Each page requests its own slots once; the layout requests none.
    expect(
      calls
        .filter(({ url }) => url.pathname === '/api/v1/slots')
        .map(({ url }) => url.search),
    ).toEqual([
      '?path=%2F',
      '?path=%2Fhello',
      '?path=%2F',
      '?path=%2Fcategory%2Fnews',
      '?path=%2Fsearch',
    ]);
    expect(pages[1]).toMatchObject({
      slots: {
        head: [],
        'site.header': [],
        'site.footer': [],
        'content.before': [],
        'content.after': [],
        'comments.before': [],
        'comments.after': [],
      },
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.authorization).toBeNull();
      expect(call.url.pathname).not.toContain('/admin/');
    }
    for (const data of pages)
      expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(pages[1]).toMatchObject({
      posts: {
        items: [{ slug: 'hello', categories: [{ slug: 'news' }] }],
      },
    });
    expect(pages[3]).toMatchObject({
      query: 'hello',
      posts: { items: [{ type: 'post' }, { type: 'page' }] },
    });
    expect(pages[4]).toMatchObject({
      posts: { items: [{ type: 'post' }, { type: 'page' }] },
    });
    expect(
      calls.some(
        ({ url }) =>
          url.searchParams.get('search') === 'hello' &&
          url.searchParams.get('page') === '2' &&
          !url.searchParams.has('type'),
      ),
    ).toBe(true);
  });

  test('former permalinks redirect permanently, and only within the site', async () => {
    expect(
      await loadEntry(publicEvent('/2025/old?utm_source=x')).catch(
        (thrown: unknown) => thrown,
      ),
    ).toMatchObject({ status: 308, location: '/2026/moved?utm_source=x' });

    override = ({ url }) =>
      url.pathname === '/api/v1/resolve'
        ? json({
            content: { ...content('moved'), path: '//evil.test/x' },
            redirect: true,
          })
        : undefined;
    expect(
      await loadEntry(publicEvent('/2025/old')).catch(
        (thrown: unknown) => thrown,
      ),
    ).toMatchObject({ status: 502 });
  });

  test('the configured public login path renders there with a safe return path', async () => {
    const data = await loadEntry(
      publicEvent(
        '/members/sign-in?redirect_to=%2Fhello',
        {},
        '/(site)/[...path]',
        '/members/sign-in',
      ),
    );
    // Methods are projected field by field; nothing a plugin adds reaches the page.
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(data).toMatchObject({
      kind: 'login',
      back: '/hello',
      signIn: {
        methods: [
          { id: 'password', options: [] },
          {
            id: 'plugin:magic:link',
            options: [{ id: 'mail', label: 'Email me' }],
          },
        ],
        passwordReset: true,
      },
      captcha: { provider: 'none' },
    });
  });

  test('sign-in screens speak the site language and receive display data only', async () => {
    override = ({ url }) =>
      url.pathname === '/api/v1/site'
        ? json({
            title: 'Site',
            description: SECRET,
            locale: 'ko-KR',
            loginPath: '/members/sign-in',
            showLogin: true,
          })
        : undefined;
    const locals: { lang?: string } = {};
    const data = await loadAuthLayout({
      fetch: fakeFetch,
      request: new Request('http://web.test/admin/forgot-password', {
        headers: { 'accept-language': 'en-US' },
      }),
      locals,
    } as never);

    expect(locals.lang).toBe('ko');
    expect(data).toEqual({
      privacyPolicy: null,
      language: 'ko',
      loginPath: '/members/sign-in',
      siteTitle: 'Site',
    });
  });

  test('password links stay out of caches and referrers, and malformed ones get no form', async () => {
    for (const [query, linkValid] of [
      ['', false],
      ['?token=short', false],
      [`?token=${TOKEN}`, true],
    ] as const) {
      const headers: Record<string, string> = {};
      const data = await loadPasswordPage({
        url: new URL(`http://web.test/admin/password${query}`),
        fetch: fakeFetch,
        setHeaders: (values: Record<string, string>) =>
          Object.assign(headers, values),
      } as never);
      expect(headers).toEqual({
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      // The setup methods are asked for only with a usable link.
      expect(data).toMatchObject({
        linkValid,
        methods: [],
        unavailable: false,
      });
    }
  });

  test('archive aliases redirect to the stored Unicode slug', async () => {
    override = ({ url }) =>
      url.pathname === '/api/v1/taxonomies/category/cafe'
        ? json({
            id: 'cafe',
            taxonomy: 'category',
            name: 'Café',
            slug: 'café',
            description: '',
            parentId: null,
            count: 1,
            seo: publicSeo,
          })
        : undefined;
    expect(
      await loadCategory(
        publicEvent('/category/cafe?ref=old', { slug: 'cafe' }),
      ).catch((thrown: unknown) => thrown),
    ).toMatchObject({ status: 308, location: '/category/caf%C3%A9?ref=old' });
  });

  test('block data shared by the error template and the page, and archive slots, load once', async () => {
    const footer = [
      { name: 'latest-posts', attrs: { count: 5 } },
      { name: 'archives', attrs: { months: 12 } },
    ];
    const shared = {
      ...theme,
      templates: {
        index: [{ name: 'template-part', attrs: { slug: 'footer' } }],
        single: [
          { name: 'post-navigation' },
          { name: 'template-part', attrs: { slug: 'footer' } },
        ],
      },
      parts: [{ slug: 'footer', area: 'footer', blocks: footer }],
    };
    override = ({ url }) =>
      url.pathname === '/api/v1/layout'
        ? json({
            site: { title: 'Site', description: '', locale: 'en' },
            seo: SEO_SETTINGS_DEFAULTS,
            theme: shared,
            reading,
            menus: { primary: null, footer: null },
            widgets: { sidebar: [], footer: [] },
            archives: {
              bases: { category: '/topics', tag: '/tag' },
              history: { category: [], tag: [] },
            },
          })
        : url.pathname === '/api/v1/adjacent'
          ? json({ previous: null, next: null })
          : url.pathname === '/api/v1/months'
            ? // Fewer months than asked for is still the complete answer.
              json([{ year: 2026, month: 1, count: 1 }])
            : undefined;
    const layout = await loadSiteLayout(publicEvent('/'));
    const withLayout = (path: string) =>
      ({
        ...(publicEvent(path) as object),
        parent: async () => layout,
      }) as never;
    const entry = await loadEntry(withLayout('/hello'));
    const latest = calls.filter(
      ({ url }) =>
        url.pathname === '/api/v1/content' &&
        url.searchParams.get('pageSize') === '5',
    );
    expect(latest).toHaveLength(1);
    expect(
      calls.filter(({ url }) => url.pathname === '/api/v1/months'),
    ).toHaveLength(1);
    expect(entry).toMatchObject({ adjacent: { previous: null, next: null } });

    calls = [];
    expect(await loadEntry(withLayout('/topics/news'))).toMatchObject({
      kind: 'term',
    });
    const paths = calls.map(({ url }) => url.pathname);
    expect(paths.filter((path) => path === '/api/v1/slots')).toHaveLength(1);
    expect(paths).not.toContain('/api/v1/content-types');
  });

  test('the calendar assigns boundary posts to the site-local day', async () => {
    const { html: _html, fields: _fields, ...item } = content('boundary');
    override = ({ url }) => {
      if (url.pathname === '/api/v1/month-neighbours')
        return json({ previous: null, next: null });
      if (url.pathname === '/api/v1/content')
        return json({
          items: [{ ...item, publishedAt: '2026-01-31T16:00:00.000Z' }],
          total: 1,
          page: 1,
          pageSize: 100,
        });
      return undefined;
    };
    const { parseBlocks } = await import('@cms/sdk');
    const data = await loadBlockData(
      contentApi(fakeFetch),
      parseBlocks([{ name: 'calendar' }]).blocks,
      {
        entry: null,
        authors: [],
        month: { year: 2026, month: 2 },
        timeZone: 'Asia/Seoul',
      },
    );
    expect(data.calendar?.days).toEqual({ 1: 1 });
    expect(calls.some(({ url }) => url.pathname === '/api/v1/reading')).toBe(
      false,
    );
  });

  test('the page list reads every page and leaves out locked ones', async () => {
    override = ({ url }) => {
      if (url.pathname !== '/api/v1/content') return undefined;
      const page = Number(url.searchParams.get('page'));
      const items = Array.from(
        { length: page === 1 ? 100 : 50 },
        (_, index) => {
          const {
            html: _html,
            fields: _fields,
            ...item
          } = content(`p${page}-${index}`, 'page');
          return { ...item, protected: page === 2 && index === 0 };
        },
      );
      return json({ items, total: 150, page, pageSize: 100 });
    };
    const { parseBlocks } = await import('@cms/sdk');
    const data = await loadBlockData(
      contentApi(fakeFetch),
      parseBlocks([{ name: 'page-list' }]).blocks,
    );
    expect(data.pageTree).toHaveLength(149);
    expect(data.pageTree!.map((entry) => entry.title)).not.toContain(
      'Title p2-0',
    );
  });

  test('oEmbed describes public, unlocked entries of this site only, as an escaped card', async () => {
    override = ({ url }) => {
      if (url.pathname === '/api/v1/seo')
        return json({ ...SEO_SETTINGS_DEFAULTS, siteUrl: 'https://site.test' });
      if (
        url.pathname === '/api/v1/resolve' &&
        url.searchParams.get('path') === '/locked'
      )
        return json({
          content: { ...content('locked'), protected: true, title: '<x>' },
          redirect: false,
        });
      if (
        url.pathname === '/api/v1/resolve' &&
        url.searchParams.get('path') === '/hello'
      )
        return json({
          content: { ...content('hello'), title: 'A <b>bold</b> title' },
          redirect: false,
        });
      return undefined;
    };
    const ask = (target: string) =>
      oembed({
        fetch: fakeFetch,
        url: new URL(
          `http://web.test/oembed?format=json&url=${encodeURIComponent(target)}`,
        ),
      } as never);
    expect((await ask('https://other.test/hello')).status).toBe(404);
    expect((await ask('https://site.test/locked')).status).toBe(404);
    const card = (await (await ask('https://site.test/hello')).json()) as {
      type: string;
      html: string;
    };
    expect(card.type).toBe('rich');
    expect(card.html).toContain('A &lt;b&gt;bold&lt;/b&gt; title');
    expect(card.html).not.toContain('<iframe');
  });

  test('feeds refuse values that are not slugs instead of shortening them', async () => {
    const response = await feed({
      fetch: fakeFetch,
      url: new URL(`http://web.test/feed.xml?category=${'a'.repeat(192)}`),
    } as never);
    expect(response.status).toBe(404);
    expect(
      calls.some(({ url }) => url.pathname.startsWith('/api/v1/taxonomies')),
    ).toBe(false);
  });
});

test('failed replies retain their parent and retry redirects to the returned comment page', async () => {
  const fields = {
    contentId: 'id-hello',
    parentId: 'parent',
    parentName: 'Ann',
    authorName: 'Reader',
    authorEmail: 'reader@example.com',
    body: 'Reply',
  };
  const event = () =>
    ({
      ...(adminEvent('/hello?/comment&cpage=2', fields) as object),
      getClientAddress: () => '203.0.113.1',
      cookies: {
        get: () => undefined,
        getAll: () => [],
        delete: () => undefined,
      },
    }) as Parameters<typeof commentAction>[0];
  override = ({ url }) =>
    url.pathname === '/api/v1/comments'
      ? json(
          { error: { code: 'captcha_required', message: 'Solve captcha' } },
          403,
        )
      : undefined;
  const failure = failureData(await commentAction(event()));
  expect(failure).toMatchObject({
    parentId: 'parent',
    parentName: 'Ann',
    captcha: true,
  });
  override = ({ url, body, method }) => {
    if (url.pathname !== '/api/v1/comments' || method === 'GET')
      return undefined;
    expect(JSON.parse(body).parentId).toBe(failure.parentId);
    return json({
      status: 'approved',
      page: 2,
      pendingProof: null,
      comment: {
        id: 'reply',
        parentId: 'parent',
        depth: 1,
        authorName: 'Reader',
        authorUrl: null,
        byAuthor: false,
        avatarUrl: null,
        pending: false,
        body: 'Reply',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
  };
  expect(
    await commentAction(event()).catch((error: unknown) => error),
  ).toMatchObject({ status: 303, location: '/hello?cpage=2#comment-reply' });
});

test('remembered commenters send and rotate only the signed proof cookie', async () => {
  const set: { name: string; value: string }[] = [];
  const base = adminEvent('/hello?/comment', {
    contentId: 'id-hello',
    authorName: 'Reader',
    authorEmail: 'reader@example.com',
    body: 'Hello',
    remember: 'on',
  });
  const event = {
    ...(base as object),
    getClientAddress: () => '203.0.113.1',
    cookies: {
      get: (name: string) =>
        name === 'cms_commenter_proof' ? 'old-signed-proof' : undefined,
      getAll: () => [],
      set: (name: string, value: string) => set.push({ name, value }),
      delete: () => undefined,
    },
  } as Parameters<typeof commentAction>[0];
  override = ({ url, method }) =>
    url.pathname === '/api/v1/comments' && method === 'POST'
      ? json({
          status: 'approved',
          page: 1,
          pendingProof: null,
          commenterProof: 'new-signed-proof',
          comment: {
            id: 'comment',
            parentId: null,
            depth: 0,
            authorName: 'Reader',
            authorUrl: null,
            byAuthor: false,
            avatarUrl: null,
            pending: false,
            body: 'Hello',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        })
      : undefined;

  await commentAction(event).catch(() => undefined);

  expect(calls[0]?.commenterProof).toBe('old-signed-proof');
  expect(set).toContainEqual({
    name: 'cms_commenter_proof',
    value: 'new-signed-proof',
  });
});

test('privacy confirmations in different tabs use separate proofs and never serialize them', async () => {
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ];
  const tokens = ids.map((id) => `${id}.2000000000000.nonce.signature`);
  const jar = new Map<string, string>();
  const cookies = {
    get: (name: string) => jar.get(name),
    set: (name: string, value: string, options: unknown) => {
      expect(options).toMatchObject({
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'strict',
      });
      jar.set(name, value);
    },
    delete: (name: string) => jar.delete(name),
  };
  for (const [index, token] of tokens.entries()) {
    const result = await Promise.resolve(
      loadPrivacy({
        fetch: fakeFetch,
        url: new URL(`https://web.test/privacy/confirm?token=${token}`),
        cookies,
        setHeaders: () => undefined,
      } as never),
    ).catch((error: unknown) => error);
    expect(result).toMatchObject({
      status: 303,
      location: `/privacy/confirm?request=${ids[index]}`,
    });
    expect(JSON.stringify(result)).not.toContain(token);
  }
  override = ({ url, body }) => {
    if (url.pathname !== '/api/v1/privacy/confirm') return undefined;
    expect(JSON.parse(body).token).toBe(tokens[0]);
    return new Response(null, { status: 204 });
  };
  const body = new FormData();
  body.set('requestId', ids[0]!);
  const result = await privacyActions.confirm!({
    fetch: fakeFetch,
    url: new URL(`https://web.test/privacy/confirm?/confirm&request=${ids[0]}`),
    request: new Request('https://web.test/privacy/confirm', {
      method: 'POST',
      body,
    }),
    cookies,
    setHeaders: () => undefined,
    getClientAddress: () => '203.0.113.1',
  } as never);
  expect(result).toEqual({ notice: 'privacyConfirmed' });
  expect(jar.size).toBe(1);
  expect(JSON.parse(jar.get('__Host-cms_privacy_confirmations')!)).toEqual([
    { id: ids[1], token: tokens[1] },
  ]);
});

test('enhanced comments refresh only the returned thread and scrub disabled remembered fields', async () => {
  const cookies = new Map<string, string>();
  const headers = new Headers();
  const base = adminEvent('/hello?/comment&page=2&cpage=1', {
    contentId: 'id-hello',
    body: 'My draft',
    parentId: 'parent',
    parentName: 'Reader',
    authorName: 'Forged',
    authorEmail: 'forged@example.com',
    authorUrl: 'https://forged.test',
    remember: 'on',
  });
  base.request.headers.set('x-sveltekit-action', 'true');
  const event = {
    ...base,
    getClientAddress: () => '203.0.113.1',
    setHeaders: (values: Record<string, string>) => {
      for (const [key, value] of Object.entries(values))
        headers.set(key, value);
    },
    cookies: {
      get: (name: string) => cookies.get(name),
      getAll: () => [],
      set: (name: string, value: string) => cookies.set(name, value),
      delete: (name: string) => cookies.delete(name),
    },
  } as Parameters<typeof commentAction>[0];
  override = ({ url, method }) => {
    if (url.pathname !== '/api/v1/comments') return undefined;
    if (method === 'POST')
      return json({
        status: 'pending',
        page: 3,
        pendingProof: 'signed-pending',
        commenterProof: null,
        comment: null,
      });
    expect(cookies.get('cms_pending_id-hello')).toBe('signed-pending');
    return json({
      items: [],
      total: 12,
      count: 15,
      page: 3,
      pageSize: 5,
      open: true,
      fields: { name: false, email: false, website: false },
      threadDepth: 3,
      truncated: false,
      ownPending: {
        id: 'mine',
        parentId: 'parent',
        depth: 1,
        authorName: 'Guest',
        authorUrl: null,
        byAuthor: false,
        body: 'My draft',
        pending: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
  };
  const result = await commentAction(event);
  expect(headers.get('cache-control')).toBe('private, no-store');
  expect(result).toMatchObject({
    commented: true,
    moderation: true,
    location: '/hello?page=2&cpage=3&moderation=1#comments',
    comments: {
      count: 15,
      page: 3,
      ownPending: { body: 'My draft', pending: true },
    },
  });
  expect(cookies.has('cms_commenter')).toBe(false);
  expect(cookies.has('cms_commenter_proof')).toBe(false);
  expect(JSON.stringify(result)).not.toContain('forged@example.com');
  expect(calls.map(({ method, url }) => `${method} ${url.pathname}`)).toEqual([
    'POST /api/v1/comments',
    'GET /api/v1/comments',
  ]);
});

describe('public comment moderation', () => {
  const adminComment = (id: string, status: string) => ({
    id,
    contentId: 'id-hello',
    contentTitle: 'Title hello',
    parentAuthor: null,
    parentId: null,
    userId: `${SECRET}-user`,
    authorName: 'Reader',
    authorEmail: `${SECRET}@example.com`,
    authorUrl: '',
    body: `Held ${id}`,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  const moderationList = (call: Call) =>
    call.url.pathname === '/api/v1/admin/comments'
      ? json({
          items: [
            adminComment(
              call.url.searchParams.get('status') === 'spam' ? 'junk' : 'held',
              call.url.searchParams.get('status')!,
            ),
          ],
          total: 1,
          page: 1,
          pageSize: 100,
        })
      : undefined;
  const sessionCookies = (session: boolean) => ({
    get: (name: string) =>
      session && name === 'cms_session' ? TOKEN : undefined,
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
  });
  /** The event with `setHeaders` recording into the returned `headers`. */
  const recordHeaders = (event: object) => {
    const headers = new Headers();
    return {
      headers,
      event: {
        ...event,
        setHeaders: (values: Record<string, string>) => {
          for (const [key, value] of Object.entries(values))
            headers.set(key, value);
        },
      } as never,
    };
  };
  const entryEvent = (path: string, session: boolean) => {
    const base = publicEvent(path) as { url: URL };
    return recordHeaders({
      ...base,
      request: new Request(base.url),
      cookies: sessionCookies(session),
    });
  };
  const moderationEvent = (
    path: string,
    form: Record<string, string | string[]>,
    { session = true, enhanced = true } = {},
  ) => {
    const base = adminEvent(path, form) as { request: Request };
    if (enhanced) base.request.headers.set('x-sveltekit-action', 'true');
    return recordHeaders({ ...base, cookies: sessionCookies(session) });
  };
  const bulkCalls = () =>
    calls.filter(({ url }) => url.pathname === '/api/v1/admin/comments/bulk');
  const moderate = entryActions.moderateComment!;

  test('moderators get the projected, uncached pending and spam comments of the entry', async () => {
    override = moderationList;
    const { event, headers } = entryEvent('/hello', true);
    const data = (await loadEntry(event)) as {
      comments: { management: unknown };
    };

    const lists = calls.filter(
      ({ url }) => url.pathname === '/api/v1/admin/comments',
    );
    expect(lists.map(({ authorization }) => authorization)).toEqual([
      `Bearer ${TOKEN}`,
      `Bearer ${TOKEN}`,
    ]);
    expect(
      lists.map(({ url }) => ({
        contentId: url.searchParams.get('contentId'),
        status: url.searchParams.get('status'),
        pageSize: url.searchParams.get('pageSize'),
      })),
    ).toEqual(
      ['pending', 'spam'].map((status) => ({
        contentId: 'id-hello',
        status,
        pageSize: '100',
      })),
    );
    const held = (id: string, status: string) => ({
      id,
      parentId: null,
      parentAuthor: null,
      authorName: 'Reader',
      authorUrl: '',
      body: `Held ${id}`,
      status,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(data.comments.management).toEqual({
      items: [held('held', 'pending'), held('junk', 'spam')],
    });
    expect(headers.get('cache-control')).toBe('private, no-store');
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });

  test('anonymous visitors and non-moderators get no moderation list', async () => {
    const anonymous = entryEvent('/hello', false);
    const data = (await loadEntry(anonymous.event)) as {
      comments: { management: unknown };
    };
    expect(data.comments.management).toBeNull();
    expect(
      calls.some(({ url }) => url.pathname.startsWith('/api/v1/admin/')),
    ).toBe(false);
    expect(anonymous.headers.has('cache-control')).toBe(false);

    override = ({ url }) =>
      url.pathname === '/api/v1/admin/comments'
        ? json({ error: { code: 'forbidden', message: 'Forbidden' } }, 403)
        : undefined;
    const subscriber = entryEvent('/hello', true);
    const signedIn = (await loadEntry(subscriber.event)) as {
      comments: { management: unknown };
    };
    expect(signedIn.comments.management).toBeNull();
    expect(subscriber.headers.has('cache-control')).toBe(false);
  });

  test('refuses missing sessions, invalid input, unconfirmed deletes and other entries before the API', async () => {
    const valid = {
      commentId: 'held',
      contentId: 'id-hello',
      operation: 'approve',
    };
    const anonymous = moderationEvent('/hello?/moderateComment', valid, {
      session: false,
    });
    expect(failureData(await moderate(anonymous.event))).toMatchObject({
      code: 'forbidden',
      moderationFailed: true,
    });
    expect(anonymous.headers.get('cache-control')).toBe('private, no-store');
    for (const form of [
      { ...valid, operation: 'spam' },
      { ...valid, commentId: '' },
      { ...valid, commentId: ['held', 'held'] },
      {
        ...valid,
        commentId: Array.from({ length: 101 }, (_, index) => `c${index}`),
      },
      { ...valid, contentId: 'x'.repeat(37) },
      { ...valid, operation: 'delete' },
    ])
      expect(
        failureData(
          await moderate(
            moderationEvent('/hello?/moderateComment', form).event,
          ),
        ),
      ).toMatchObject({ code: 'invalid_input', moderationFailed: true });
    // A forged entry id, an unknown address and a still-locked entry are not this page's.
    expect(
      failureData(
        await moderate(
          moderationEvent('/hello?/moderateComment', {
            ...valid,
            contentId: 'id-other',
          }).event,
        ),
      ),
    ).toMatchObject({ code: 'not_found', moderationFailed: true });
    expect(
      failureData(
        await moderate(
          moderationEvent('/missing?/moderateComment', valid).event,
        ),
      ),
    ).toMatchObject({ code: 'not_found' });
    override = ({ url }) =>
      url.pathname === '/api/v1/resolve'
        ? json({
            content: { ...content('hello'), protected: true },
            redirect: false,
          })
        : undefined;
    expect(
      failureData(
        await moderate(moderationEvent('/hello?/moderateComment', valid).event),
      ),
    ).toMatchObject({ code: 'not_found' });
    expect(bulkCalls()).toHaveLength(0);
  });

  test('scopes the change to the entry and reports API refusals as form failures', async () => {
    override = ({ url }) =>
      url.pathname === '/api/v1/admin/comments/bulk'
        ? json(
            {
              error: {
                code: 'not_found',
                message: 'Comment not found',
                debug: SECRET,
              },
            },
            404,
          )
        : undefined;
    const data = failureData(
      await moderate(
        moderationEvent('/hello?/moderateComment', {
          commentId: 'elsewhere',
          contentId: 'id-hello',
          operation: 'trash',
        }).event,
      ),
    );
    expect(data).toMatchObject({ code: 'not_found', moderationFailed: true });
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(JSON.parse(bulkCalls()[0]!.body)).toEqual({
      ids: ['elsewhere'],
      action: 'trash',
      contentId: 'id-hello',
    });
  });

  test('every operation saves through the moderation API and returns refreshed, projected lists', async () => {
    for (const operation of ['approve', 'unapprove', 'trash', 'delete']) {
      calls = [];
      override = (call) =>
        call.url.pathname === '/api/v1/admin/comments/bulk'
          ? new Response(null, { status: 204 })
          : moderationList(call);
      const { event, headers } = moderationEvent(
        '/hello?/moderateComment&cpage=2',
        {
          commentId: ['held', 'junk'],
          contentId: 'id-hello',
          operation,
          ...(operation === 'delete' && { confirm: 'delete' }),
        },
      );
      const result = await moderate(event);
      expect(headers.get('cache-control')).toBe('private, no-store');
      expect(bulkCalls()[0]!.authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(bulkCalls()[0]!.body)).toEqual({
        ids: ['held', 'junk'],
        action: operation,
        contentId: 'id-hello',
      });
      expect(result).toMatchObject({
        moderated: true,
        operation,
        commentIds: ['held', 'junk'],
        comments: { page: 2 },
        management: { items: [{ id: 'held' }, { id: 'junk' }] },
      });
      expect(JSON.stringify(result)).not.toContain(SECRET);
    }
  });

  test('a saved change stays successful when the refresh fails, and plain forms redirect', async () => {
    override = ({ url, method }) => {
      if (url.pathname === '/api/v1/admin/comments/bulk')
        return new Response(null, { status: 204 });
      if (
        url.pathname === '/api/v1/admin/comments' ||
        (url.pathname === '/api/v1/comments' && method === 'GET')
      )
        return json({ error: { code: 'internal', message: 'Down' } }, 500);
      return undefined;
    };
    const form = {
      commentId: 'held',
      contentId: 'id-hello',
      operation: 'approve',
    };
    expect(
      await moderate(moderationEvent('/hello?/moderateComment', form).event),
    ).toMatchObject({ moderated: true, comments: null, management: null });
    expect(
      await moderate(
        moderationEvent('/hello?/moderateComment&cpage=2', form, {
          enhanced: false,
        }).event,
      ).catch((error: unknown) => error),
    ).toMatchObject({
      status: 303,
      location:
        '/hello?cpage=2&commentNotice=commentNoticeApproved#comment-moderation',
    });
    // Without scripts, a refusal is marked as a moderation failure for the page to show.
    expect(
      failureData(
        await moderate(
          moderationEvent(
            '/hello?/moderateComment',
            { ...form, operation: 'delete' },
            { enhanced: false },
          ).event,
        ),
      ),
    ).toMatchObject({ code: 'invalid_input', moderationFailed: true });
    calls = [];
    override = ({ url }) =>
      url.pathname === '/api/v1/admin/comments/bulk'
        ? new Response(null, { status: 204 })
        : undefined;
    expect(
      await moderate(
        moderationEvent(
          '/hello?/moderateComment',
          { ...form, operation: 'delete', confirm: 'delete' },
          { enhanced: false },
        ).event,
      ).catch((error: unknown) => error),
    ).toMatchObject({
      status: 303,
      location: '/hello?commentNotice=commentNoticeDeleted#comment-moderation',
    });
  });

  test('the static front page moderates the entry it shows at /', async () => {
    override = (call) => {
      if (call.url.pathname === '/api/v1/reading')
        return json({ ...reading, frontPage: 'page', frontPagePath: '/hello' });
      if (call.url.pathname === '/api/v1/admin/comments/bulk')
        return new Response(null, { status: 204 });
      return moderationList(call);
    };
    const result = await homeActions.moderateComment!(
      moderationEvent('/?/moderateComment', {
        commentId: 'held',
        contentId: 'id-hello',
        operation: 'trash',
      }).event,
    );
    expect(result).toMatchObject({ moderated: true, operation: 'trash' });
    // The entry's own address redirects to `/`, so it takes no moderation.
    expect(
      failureData(
        await moderate(
          moderationEvent('/hello?/moderateComment', {
            commentId: 'held',
            contentId: 'id-hello',
            operation: 'trash',
          }).event,
        ),
      ),
    ).toMatchObject({ code: 'not_found' });
  });
});

describe('admin form failures', () => {
  test('API errors echo only the term fields and path/message issues', async () => {
    override = () =>
      json(
        {
          error: {
            code: 'conflict',
            message: 'Slug already in use',
            issues: [{ path: 'slug', message: 'Taken', received: SECRET }],
            debug: SECRET,
          },
        },
        409,
      );
    const data = failureData(
      await categoryActions.update(
        adminEvent('/admin/categories?/update', {
          id: 'c1',
          name: 'News',
          slug: 'news',
          description: '',
          parentId: '',
          password: SECRET,
        }),
      ),
    );

    expect(calls[0].authorization).toBe(`Bearer ${TOKEN}`);
    expect(data).toEqual({
      intent: 'update',
      values: {
        id: 'c1',
        name: 'News',
        slug: 'news',
        description: '',
        parentId: '',
      },
      message: 'Slug already in use',
      // The error code lets the screen show catalog text in the reader's language.
      code: 'conflict',
      issues: [{ path: 'slug', message: 'Taken' }],
    });
    expect(JSON.stringify(data)).not.toContain(TOKEN);
  });

  test('content validation keeps typed fields and term assignments, nothing else', async () => {
    const data = failureData(
      await newContentActions.save(
        adminEvent('/admin/content/new?/save', {
          type: 'post',
          title: '',
          slug: 'draft-post',
          excerpt: 'Short',
          status: 'draft',
          document: JSON.stringify({ type: 'doc', content: [] }),
          categoryIds: ['c1', 'c1', 'c2'],
          tagIds: ['t1'],
          password: SECRET,
        }),
      ),
    );

    // Only the field definitions are read; nothing is written.
    expect(calls.filter(({ method }) => method !== 'GET')).toHaveLength(0);
    expect(data.values).toEqual({
      type: 'post',
      title: '',
      slug: 'draft-post',
      excerpt: 'Short',
      status: 'draft',
      document: { type: 'doc', content: [] },
      categoryIds: ['c1', 'c2'],
      tagIds: ['t1'],
      extraTermIds: [],
      parentId: '',
      publishedAt: '',
      sticky: false,
      allowComments: false,
      authorId: '',
      featuredMediaId: '',
      fields: {},
    });
    // The content password field is never echoed back.
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });

  test('SEO saves send the full fieldset, echo only its declared keys, and leave SEO alone without it', async () => {
    override = ({ method }) =>
      method === 'PUT'
        ? json({ error: { code: 'conflict', message: 'Conflict' } }, 409)
        : undefined;
    const seo = {
      ...DEFAULT_ENTRY_SEO,
      title: 'News and updates',
      noIndex: true,
      focusKeyword: 'news',
    };
    const data = failureData(
      await categoryActions.update(
        adminEvent('/admin/categories?/update', {
          id: 'c1',
          name: 'News',
          slug: 'news',
          description: '',
          parentId: '',
          seo: '1',
          'seo.title': seo.title,
          'seo.noIndex': 'on',
          'seo.schemaType': seo.schemaType,
          'seo.focusKeyword': seo.focusKeyword,
          'seo.password': SECRET,
        }),
      ),
    );
    expect(JSON.parse(calls[0].body).seo).toEqual(seo);
    expect((data.values as { seo: unknown }).seo).toEqual(seo);
    expect(JSON.stringify(data)).not.toContain(SECRET);

    calls = [];
    await editContentActions.save(
      adminEvent(
        '/admin/content/id-hello?/save',
        {
          type: 'post',
          title: 'Hello',
          status: 'draft',
          document: JSON.stringify({ type: 'doc', content: [] }),
        },
        { id: 'id-hello' },
      ),
    );
    const write = calls.find(({ method }) => method === 'PUT')!;
    expect(JSON.parse(write.body)).not.toHaveProperty('seo');
  });

  test('an oversized theme archive is refused before the API, without echo', async () => {
    const data = failureData(
      await appearanceActions.install(
        adminEvent('/admin/appearance?/install', {
          theme: new File([SECRET.repeat(300_000)], 'theme.zip'),
        }),
      ),
    );

    expect(calls).toHaveLength(0);
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });

  test('site editor blocks that fail the shared schema are refused before the API, without echo', async () => {
    const data = failureData(
      await editorActions.saveTemplate(
        adminEvent('/admin/appearance/editor?/saveTemplate', {
          theme: 'canvas',
          name: 'index',
          blocks: JSON.stringify([
            { name: 'script', attrs: { src: SECRET } },
            { name: 'paragraph', attrs: { text: SECRET, onclick: SECRET } },
          ]),
        }),
      ),
    );

    expect(calls).toHaveLength(0);
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });
});

/** Runs the server hook for a signed-out request whose route resolves with `status`. */
const handleSignedOut = (
  path: string,
  {
    route = '/(site)',
    method = 'GET',
    status,
  }: { route?: string; method?: string; status: number },
) => {
  const event = Object.assign(publicEvent(path, {}, route), {
    request: new Request(`http://web.test${path}`, { method }),
    locals: { token: null, user: null },
  });
  return with_request_store({ event, state: {} as never }, () =>
    handleRequest({
      event,
      resolve: async () => new Response(null, { status }),
    }),
  );
};

test('only pages that render the captcha widget admit its origin in their policy', async () => {
  const origin = 'https://captcha.example';
  override = ({ url }) =>
    url.pathname === '/api/v1/install/status'
      ? json({ databaseConfigured: true, setupRequired: false })
      : undefined;
  const run = (path: string, policy: string, widget: boolean) => {
    const event = Object.assign(publicEvent(path, {}, '/(site)'), {
      request: new Request(`http://web.test${path}`),
      locals: { token: null, user: null } as App.Locals,
    });
    return with_request_store({ event, state: {} as never }, () =>
      handleRequest({
        event,
        resolve: async () => {
          // What a load does through `allowCaptcha` when its page renders the widget.
          if (widget) event.locals.captchaOrigins = [origin];
          return new Response('ok', {
            headers: { 'content-security-policy': policy },
          });
        },
      }),
    );
  };
  const strict = "default-src 'self'; script-src 'self'";
  const rendered = (await run('/', strict, true)).headers.get(
    'content-security-policy',
  )!;
  expect(rendered).toContain(`script-src 'self' ${origin}`);
  expect(rendered).toContain(`frame-src 'self' ${origin}`);
  expect(rendered).toContain(`connect-src 'self' ${origin}`);
  expect(rendered).toContain(`img-src 'self' ${origin}`);
  expect(rendered).toContain(`style-src 'self' ${origin}`);
  expect(
    (await run('/', strict, false)).headers.get('content-security-policy'),
  ).toBe(strict);
  // A policy that restricts no widget directive is left as it is.
  expect(
    (await run('/', "frame-ancestors 'none'", true)).headers.get(
      'content-security-policy',
    ),
  ).not.toContain(origin);
});

test('removed and unknown admin routes stay private 404s instead of login redirects', async () => {
  for (const [path, method] of [
    ['/admin/login', 'POST'],
    ['/admin/login/__data.json', 'GET'],
    ['/admin/missing', 'GET'],
  ]) {
    const response = await handleSignedOut(path!, {
      route: '/(site)/[...path]',
      method,
      status: 404,
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  }
});

test('hidden login masks protected admin screens while visible login uses the configured path', async () => {
  for (const showLogin of [false, true]) {
    override = ({ url }) => {
      if (url.pathname === '/api/v1/install/status')
        return json({ databaseConfigured: true, setupRequired: false });
      if (url.pathname === '/api/v1/site')
        return json({
          title: 'Site',
          description: '',
          locale: 'en',
          loginPath: '/members/sign-in',
          showLogin,
        });
      return undefined;
    };
    const response = await handleSignedOut('/admin/content', {
      route: '/admin/(app)/content',
      status: 200,
    });
    expect(response.status).toBe(showLogin ? 303 : 404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('location')).toBe(
      showLogin ? '/members/sign-in?redirect_to=%2Fadmin%2Fcontent' : null,
    );
  }
});

test('public error responses are not cached when a route may become a login page', async () => {
  override = ({ url }) =>
    url.pathname === '/api/v1/install/status'
      ? json({ databaseConfigured: true, setupRequired: false })
      : undefined;
  const response = await handleSignedOut('/not-created', { status: 404 });
  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
