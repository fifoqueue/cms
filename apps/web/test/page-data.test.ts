// Regression guard for the public/admin page-data boundary: what loaders and the server hook
// serialize to the browser. Sentinel values must never appear in returned data.
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { with_request_store } from '@sveltejs/kit/internal/server';
import { defineFunctions } from '@cms/sdk/functions';
import { WebHookBus } from '#lib/server/web-hooks.js';
import { renderRequest } from '#lib/server/render-request.js';
import { filterPageData } from '#lib/server/page-data.js';
import { createContentClient } from '@cms/sdk/client';
import { renderHtml } from '#lib/theme/html-body.js';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  toPublicEntrySeo,
} from '@cms/sdk';

// SvelteKit provides `$app/env/private` at build time; point the SDK clients at a fake API.
let requestEvent: unknown;

Bun.plugin({
  name: 'sveltekit-env',
  setup(build) {
    build.module('$app/server', () => ({
      exports: { getRequestEvent: () => requestEvent },
      loader: 'object',
    }));
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
    build.module('$app/env', () => ({
      exports: { browser: false, dev: false, building: false, version: '' },
      loader: 'object',
    }));
  },
});

// The web server is unpaired: no frontend secret, whatever `data/` the working directory holds.
mock.module('#lib/server/frontend-secret.js', () => ({
  frontendSecret: () => '',
  pairFrontend: async () => undefined,
}));

const { load: loadSiteLayout } =
  await import('#web/routes/(site)/+layout.server.js');
const { loadBlockData } = await import('#lib/server/theme-queries.js');
const { handle: handleRequest, handleError: handlePageError } =
  await import('#web/hooks.server.js');
const { load: loadHome } = await import('#web/routes/(site)/+page.server.js');
const { load: loadPreview } =
  await import('#web/routes/(site)/preview/[token]/+page.server.js');
const { load: loadEntry } =
  await import('#web/routes/(site)/[slug]/+page.server.js');
const { GET: markdownDocument } =
  await import('#web/routes/[slug].md/+server.js');
const { load: loadCategory } =
  await import('#web/routes/(site)/category/[slug]/+page.server.js');
const { removeApiSecrets } = await import('#web-env');
const { load: loadRegister } =
  await import('#web/routes/admin/(auth)/register/+page.server.js');

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
  canonicalOrigin: false,
  frontPagePath: null,
  postsPagePath: null,
};

/** The reading settings the layout API answers with; a test may switch to a static front page. */
let layoutReading:
  typeof reading | (typeof reading & { frontPagePath: string }) = reading;
let layoutSeo = SEO_SETTINGS_DEFAULTS;

interface Call {
  method: string;
  url: URL;
  authorization: string | null;
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
      return json({ enabled: false, registrationOpen: false });
    case '/api/v1/security/captcha':
      return json({ provider: 'none', siteKey: '', always: [] });
    case '/api/v1/layout':
      return json({
        site: { title: 'Site', description: '', locale: 'en' },
        seo: layoutSeo,
        theme,
        reading: layoutReading,
        menus: { primary: null, footer: null },
        widgets: { sidebar: [], footer: [] },
      });
    case '/api/v1/seo':
      return json(layoutSeo);

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
      return json(layoutReading);
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
    case '/api/v1/page-render':
      return json({
        slots: {
          head: '',
          'body.open': '',
          'body.close': '',
          'site.header': '',
          'site.footer': '',
          'content.before': '',
          'content.after': '',
          'comments.before': '',
          'comments.after': '',
        },
        bodyClasses: [],
        assets: [],
        headers: {},
        templateCandidates: [],
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
    {
      token: null as string | null,
      siteLayout: undefined as App.Locals['siteLayout'],
    },
    {
      get(target, key) {
        if (key === 'token') return target.token;
        if (key === 'siteLayout') return target.siteLayout;
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

beforeEach(() => {
  calls = [];
  override = undefined;
  layoutReading = reading;
  layoutSeo = SEO_SETTINGS_DEFAULTS;
});

describe('public page data', () => {
  test('web page.data filters public route DTOs and rejects invalid changes without leaking fields', async () => {
    const warnings: unknown[] = [];
    const bus = new WebHookBus({
      info() {},
      warn: (...args) => {
        warnings.push(args);
      },
      error() {},
    });
    const scope = bus.scope('functions:site');
    let invalid = false;
    const functions = defineFunctions({
      web(ctx) {
        ctx.hooks.filter('page.data', (data) => {
          if (data.kind === 'content') {
            const entry = data.content as Record<string, unknown>;

            entry.title = invalid ? 42 : 'From web functions';
            entry.html = '<p>Filtered public body</p>';
          }

          if (data.kind === 'home') data.title = 'Filtered home';
          if (data.kind === 'search') data.query = 'Filtered search';

          if (data.kind === 'term') {
            (data.term as Record<string, unknown>).name = 'Filtered term';
          }

          return data;
        });
      },
    });

    await functions.web!(scope.context);
    scope.commit();

    const entry = async () => {
      const data = await renderRequest.run({ bus }, () =>
        loadEntry(publicEvent('/hello', { slug: 'hello' })),
      );

      if (data.kind !== 'content') throw new Error('Expected entry');

      return {
        ...data,
        content: { ...data.content, html: renderHtml(data.content.html) },
      };
    };

    expect(await entry()).toMatchObject({
      content: {
        title: 'From web functions',
        html: '<p>Filtered public body</p>',
      },
    });
    invalid = true;
    expect(await entry()).toMatchObject({
      content: { title: 'Title hello', html: '<p>Body</p>' },
    });
    expect(warnings).toHaveLength(1);
    expect(
      await renderRequest.run({ bus }, () => loadHome(publicEvent('/'))),
    ).toMatchObject({ title: 'Filtered home' });
    expect(
      await renderRequest.run({ bus }, () =>
        loadHome(publicEvent('/?q=hello')),
      ),
    ).toMatchObject({ query: 'Filtered search' });
    expect(
      await renderRequest.run({ bus }, () =>
        loadCategory(publicEvent('/category/news', { slug: 'news' })),
      ),
    ).toMatchObject({ term: { name: 'Filtered term' } });
    scope.dispose();
    const untouched = { kind: 'search' as const, query: 'hello', posts: null };

    expect(
      await renderRequest.run({ bus }, () => filterPageData(untouched, '/')),
    ).toBe(untouched);
  });

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
    const event = {
      ...(publicEvent('/') as object),
      parent: async () => ({
        reading,
        theme: {
          id: theme.id,
          name: theme.name,
          settings: theme.settings,
          styles: theme.styles,
          fonts: theme.fonts,
          preview: theme.preview,
        },
      }),
    };

    requestEvent = event;
    const projected = await loadHome(event as never);

    expect(projected).toMatchObject({ template: [], parts: [] });
    expect(
      calls.filter(({ url }) => url.pathname === '/api/v1/layout'),
    ).toHaveLength(1);
    calls = [];
    layoutReading = { ...reading, frontPagePath: '/hello' };

    try {
      await loadHome({
        ...(publicEvent('/') as object),
        parent: async () => ({ reading: layoutReading, theme }),
      } as never);
    } finally {
      layoutReading = reading;
    }

    expect(
      calls
        .filter(({ url }) => url.pathname === '/api/v1/page-render')
        .map(({ url }) => ({
          path: url.searchParams.get('path'),
          contentId: url.searchParams.get('contentId'),
        })),
    ).toEqual([{ path: '/', contentId: content('hello').id }]);
    calls = [];
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

    // Each page requests its presentation once; the layout requests none.
    expect(
      calls
        .filter(({ url }) => url.pathname === '/api/v1/page-render')
        .map(({ url }) => url.searchParams.get('path')),
    ).toEqual(['/', '/hello', '/', '/category/news', '/search']);
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

  test('registered redirects preserve validated destinations and status without trusting unsafe URLs', async () => {
    for (const [to, status] of [
      ['/new?x=1', 307],
      ['https://other.test/new', 302],
    ] as const) {
      override = ({ url }) =>
        url.pathname === '/api/v1/resolve'
          ? json({ content: null, redirect: true, destination: { to, status } })
          : undefined;
      expect(
        await loadEntry(publicEvent('/old?tracking=x')).catch(
          (thrown: unknown) => thrown,
        ),
      ).toMatchObject({ status, location: to });
    }

    for (const to of [
      '//evil.test',
      'javascript:alert(1)',
      'https://user:secret@evil.test/',
      '/\\evil.test',
    ]) {
      override = ({ url }) =>
        url.pathname === '/api/v1/resolve'
          ? json({
              content: null,
              redirect: true,
              destination: { to, status: 301 },
            })
          : undefined;
      expect(
        await loadEntry(publicEvent('/old')).catch((thrown: unknown) => thrown),
      ).toMatchObject({ status: 502 });
    }
  });

  test('registration page receives the effective policy even while membership is disabled', async () => {
    override = ({ url }) =>
      url.pathname === '/api/v1/auth/register'
        ? json({ enabled: false, registrationOpen: true })
        : undefined;
    expect(await loadRegister(publicEvent('/admin/register'))).toMatchObject({
      membership: { enabled: false, registrationOpen: true },
    });
  });

  test('preview loads body slots once and preserves private presentation policy', async () => {
    const headers: Record<string, string> = {};
    const bus = new WebHookBus({ info() {}, warn() {}, error() {} });
    const scope = bus.scope('functions:site');

    scope.context.slots.provide('body.open', () => '<p>Preview open</p>');
    scope.context.slots.provide('body.close', () => '<p>Preview close</p>');
    scope.commit();
    override = ({ url }) =>
      url.pathname === '/api/v1/preview/test-token'
        ? json(content('hello'))
        : undefined;
    const event = {
      ...(publicEvent('/preview/test-token', {
        token: 'test-token',
      }) as object),
      setHeaders: (values: Record<string, string>) =>
        Object.assign(headers, values),
    };
    const data = await renderRequest.run({ bus }, () =>
      loadPreview(event as never),
    );

    expect(data).toMatchObject({
      kind: 'preview',
      slots: {
        'body.open': ['<p>Preview open</p>'],
        'body.close': ['<p>Preview close</p>'],
      },
    });
    expect(headers).toMatchObject({
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    });
    const presentationCalls = calls.filter(
      ({ url }) => url.pathname === '/api/v1/page-render',
    );

    expect(presentationCalls).toHaveLength(1);
    expect(presentationCalls[0]!.url.searchParams.get('kind')).toBe('preview');
    scope.dispose();
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
      slots: {
        head: [],
        'body.open': [],
        'body.close': [],
        'site.header': [],
        'site.footer': [],
        'content.before': [],
        'content.after': [],
        'comments.before': [],
        'comments.after': [],
      },
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
    expect(
      calls.filter(({ url }) => url.pathname === '/api/v1/page-render'),
    ).toHaveLength(0);
  });
});

describe('public comment moderation', () => {
  const UA = 'UA-SENTINEL-5d1e';
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
    authorIp: `203.0.113.${id.length}`,
    authorUserAgent: `${UA}/${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    // Every stored comment field value, private ones included: never public page data.
    fields: { phone: `${SECRET}-phone` },
  });
  const cityField = {
    key: 'city',
    label: 'City',
    type: 'text',
    options: [],
    required: true,
    help: 'Where you write from',
  };
  /** A public thread page of `count` approved comments, the first `shown`. */
  const threadOf = (count: number) => (call: Call) =>
    call.url.pathname === '/api/v1/comments' && call.method === 'GET'
      ? json({
          items: Array.from({ length: count }, (_, index) => ({
            id: index ? `c${index}` : 'shown',
            parentId: null,
            depth: 0,
            authorName: 'Reader',
            authorUrl: null,
            byAuthor: false,
            body: 'Hello',
            createdAt: '2026-01-01T00:00:00.000Z',
          })),
          total: 1,
          count: 1,
          page: 1,
          pageSize: 50,
          open: true,
          customFields: [cityField],
          threadDepth: 3,
          truncated: false,
        })
      : undefined;
  const thread = threadOf(1);
  const moderationList = (call: Call) =>
    call.url.pathname === '/api/v1/admin/comments'
      ? json({
          items: call.url.searchParams.has('ids')
            ? call.url.searchParams
                .get('ids')!
                .split(',')
                .map((id) => adminComment(id, 'approved'))
            : [
                adminComment(
                  call.url.searchParams.get('status') === 'spam'
                    ? 'junk'
                    : 'held',
                  call.url.searchParams.get('status')!,
                ),
              ],
          total: 1,
          page: 1,
          pageSize: 100,
        })
      : thread(call);
  const sessionCookies = (session: boolean, preview = false) => ({
    get: (name: string) =>
      session && name === 'cms_session' ? TOKEN : undefined,
    getAll: () =>
      preview ? [{ name: 'cms_theme_preview', value: 'preview-token' }] : [],
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
  const entryEvent = (path: string, session: boolean, preview = false) => {
    const base = publicEvent(path) as { url: URL };

    return recordHeaders({
      ...base,
      request: new Request(base.url),
      cookies: sessionCookies(session, preview),
    });
  };

  test('origins degrade without failing the page, stay out of theme previews, and batch ids by 100', async () => {
    const origins = async (preview = false) => {
      calls = [];
      const data = (await loadEntry(
        entryEvent('/hello', true, preview).event,
      )) as {
        comments: { management: { origins: object } | null };
      };

      return data.comments.management?.origins;
    };

    // The thread lookup fails: the held comments keep theirs.
    override = (call) =>
      call.url.searchParams.has('ids')
        ? json({ error: { code: 'internal', message: 'Down' } }, 500)
        : moderationList(call);
    expect(Object.keys((await origins())!)).toEqual(['held', 'junk']);

    // A theme preview carries no origins in its data, held comments included.
    override = moderationList;
    expect(await origins(true)).toEqual({});
    expect(calls.some(({ url }) => url.searchParams.has('ids'))).toBe(false);

    override = (call) =>
      call.url.pathname === '/api/v1/admin/comments'
        ? moderationList(call)
        : threadOf(150)(call);
    await origins();
    expect(
      calls
        .filter(({ url }) => url.searchParams.has('ids'))
        .map(({ url }) => url.searchParams.get('ids')!.split(',').length),
    ).toEqual([100, 50]);
  });

  test('moderators get the projected, uncached pending and spam comments of the entry', async () => {
    override = moderationList;
    const { event, headers } = entryEvent('/hello', true);
    const data = (await loadEntry(event)) as {
      comments: { management: unknown; customFields: unknown };
    };

    // The comment form gets the site's comment fields.
    expect(data.comments.customFields).toEqual([cityField]);

    const lists = calls.filter(
      ({ url }) => url.pathname === '/api/v1/admin/comments',
    );

    expect(lists.map(({ authorization }) => authorization)).toEqual([
      `Bearer ${TOKEN}`,
      `Bearer ${TOKEN}`,
      `Bearer ${TOKEN}`,
    ]);
    expect(
      lists.map(({ url }) => ({
        contentId: url.searchParams.get('contentId'),
        status: url.searchParams.get('status'),
        ids: url.searchParams.get('ids'),
        pageSize: url.searchParams.get('pageSize'),
      })),
    ).toEqual([
      ...['pending', 'spam'].map((status) => ({
        contentId: 'id-hello',
        status,
        ids: null,
        pageSize: '100',
      })),
      // The thread's comments, by id, for their IP addresses and browsers.
      { contentId: 'id-hello', status: null, ids: 'shown', pageSize: '100' },
    ]);
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
      origins: Object.fromEntries(
        ['held', 'junk', 'shown'].map((id) => [
          id,
          { ip: `203.0.113.${id.length}`, userAgent: `${UA}/${id}` },
        ]),
      ),
    });
    expect(headers.get('cache-control')).toBe('private, no-store');
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });

  test('anonymous visitors and non-moderators get no moderation list or comment origins', async () => {
    override = thread;
    const anonymous = entryEvent('/hello', false);
    const data = (await loadEntry(anonymous.event)) as {
      comments: { management: unknown };
    };

    expect(data.comments.management).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/203\.0\.113|UA-SENTINEL/);
    expect(
      calls.some(({ url }) => url.pathname.startsWith('/api/v1/admin/')),
    ).toBe(false);
    expect(anonymous.headers.has('cache-control')).toBe(false);

    override = (call) =>
      call.url.pathname === '/api/v1/admin/comments'
        ? json({ error: { code: 'forbidden', message: 'Forbidden' } }, 403)
        : thread(call);
    const subscriber = entryEvent('/hello', true);
    const signedIn = (await loadEntry(subscriber.event)) as {
      comments: { management: unknown };
    };

    expect(signedIn.comments.management).toBeNull();
    expect(JSON.stringify(signedIn)).not.toMatch(/203\.0\.113|UA-SENTINEL/);
    expect(subscriber.headers.has('cache-control')).toBe(false);
  });
});

/** Runs the server hook for a signed-out request whose route resolves with `status`. */
const handleSignedOut = (
  path: string,
  {
    route = '/(site)',
    method = 'GET',
    status,
    headers,
    requestHeaders,
    cookieNames = [],
    body = null,
    renderEntry = false,
    conditional = false,
  }: {
    route?: string;
    method?: string;
    status: number;
    headers?: Record<string, string>;
    requestHeaders?: Record<string, string>;
    cookieNames?: string[];
    body?: string | null;
    renderEntry?: boolean;
    conditional?: boolean;
  },
) => {
  const event = Object.assign(publicEvent(path, {}, route), {
    request: new Request(`http://web.test${path}`, {
      method,
      headers: requestHeaders,
    }),
    cookies: {
      getAll: () => cookieNames.map((name) => ({ name, value: 'visitor' })),
      get: (name: string) =>
        cookieNames.includes(name) ? 'visitor' : undefined,
    },
    locals: { token: null, user: null },
  });

  return with_request_store({ event, state: {} as never }, () =>
    handleRequest({
      event,
      resolve: async (resolvedEvent) => {
        if (renderEntry) await loadEntry(resolvedEvent as never);
        const unchanged =
          conditional &&
          (resolvedEvent.request.headers.has('if-none-match') ||
            resolvedEvent.request.headers.has('if-modified-since'));

        return new Response(unchanged ? null : body, {
          status: unchanged ? 304 : status,
          headers,
        });
      },
    }),
  );
};

test('entry negotiation reuses Markdown output and validators, varies caches, and advertises the alternate', async () => {
  layoutSeo = { ...SEO_SETTINGS_DEFAULTS, siteUrl: 'https://public.test' };
  override = ({ url }) =>
    url.pathname === '/api/v1/install/status'
      ? json({ databaseConfigured: true, setupRequired: false })
      : undefined;
  const options = {
    route: '/(site)/[slug]',
    status: 200,
    renderEntry: true,
    headers: { 'content-type': 'text/html', vary: 'Accept-Encoding' },
    body: '<article>Rendered entry</article>',
  };
  const html = await handleSignedOut('/hello', {
    ...options,
    requestHeaders: { accept: 'text/markdown;q=0.4, text/html;q=0.8' },
  });

  expect(html.headers.get('content-type')).toBe('text/html');
  expect(html.headers.get('vary')).toBe('Accept-Encoding, Accept');
  expect(html.headers.get('link')).toContain(
    '<https://public.test/hello.md>; rel="alternate"; type="text/markdown"',
  );
  const alias = await markdownDocument({
    ...(publicEvent('/hello.md', { slug: 'hello' }) as object),
    request: new Request('http://web.test/hello.md'),
  } as never);
  const expected = await alias.text();
  const negotiated = await handleSignedOut('/hello', {
    ...options,
    requestHeaders: { accept: 'text/html;q=0.2, text/markdown;q=0.9' },
  });

  expect(await negotiated.text()).toBe(expected);
  expect(negotiated.headers.get('etag')).toBe(alias.headers.get('etag'));
  expect(negotiated.headers.get('cache-control')).toBe(
    alias.headers.get('cache-control'),
  );
  expect(negotiated.headers.get('vary')).toBe('Accept');
  const cached = await handleSignedOut('/hello', {
    ...options,
    requestHeaders: {
      accept: 'text/markdown',
      'if-none-match': alias.headers.get('etag')!,
    },
  });

  expect(cached.status).toBe(304);
  expect(await cached.text()).toBe('');
  expect(cached.headers.get('vary')).toBe('Accept');
  const crossVariant = await handleSignedOut('/hello', {
    ...options,
    requestHeaders: {
      accept: 'text/markdown',
      'if-none-match': html.headers.get('etag')!,
    },
  });

  expect(crossVariant.status).toBe(200);
  expect(await crossVariant.text()).toBe(expected);
  const cachedHtml = await handleSignedOut('/hello', {
    ...options,
    requestHeaders: {
      accept: 'text/html',
      'if-none-match': html.headers.get('etag')!,
    },
  });

  expect(cachedHtml.status).toBe(304);
  expect(cachedHtml.headers.get('vary')).toContain('Accept');
  expect(cachedHtml.headers.get('link')).toContain('/hello.md');

  for (const [accept, type] of [
    ['text/markdown;q=0, */*;q=1', 'text/html'],
    ['text/html;q=0, text/*;q=0.8', 'text/markdown'],
    ['text/markdown;q=1, text/html;q=1', 'text/html'],
  ]) {
    const response = await handleSignedOut('/hello', {
      ...options,
      requestHeaders: { accept: accept! },
    });

    expect(response.headers.get('content-type')).toStartWith(type!);
  }
});

test('private, noindex and externally canonicalized entries never expose a Markdown alternate', async () => {
  layoutSeo = { ...SEO_SETTINGS_DEFAULTS, siteUrl: 'https://public.test' };

  for (const entry of [
    { ...content('hello'), protected: true, html: '' },
    { ...content('hello'), seo: { ...publicSeo, noIndex: true } },
    {
      ...content('hello'),
      seo: { ...publicSeo, canonicalUrl: 'https://elsewhere.test/hello' },
    },
  ]) {
    override = ({ url }) => {
      if (url.pathname === '/api/v1/install/status')
        return json({ databaseConfigured: true, setupRequired: false });
      if (url.pathname === '/api/v1/resolve')
        return json({ content: entry, redirect: false });
      if (url.pathname === '/api/v1/content/hello') return json(entry);

      return undefined;
    };

    const options = {
      route: '/(site)/[slug]',
      status: 200,
      renderEntry: true,
      headers: { 'content-type': 'text/html' },
      body: '<article>Entry</article>',
    };
    const html = await handleSignedOut('/hello', options);

    expect(html.headers.get('link')).toBeNull();
    const markdown = await handleSignedOut('/hello', {
      ...options,
      cookieNames: ['cms_session', 'cms_unlock_entry'],
      requestHeaders: { accept: 'text/markdown' },
    });

    expect(markdown.status).toBe(200);
    expect(markdown.headers.get('content-type')).toBe('text/html');
    expect(await markdown.text()).toBe('<article>Entry</article>');
    expect(markdown.headers.get('link')).toBeNull();
    expect(markdown.headers.get('vary')).toContain('Accept');
  }
});

test('unlock credentials make page data and negotiated responses private regardless of content type', async () => {
  override = ({ url }) =>
    url.pathname === '/api/v1/install/status'
      ? json({ databaseConfigured: true, setupRequired: false })
      : undefined;

  for (const type of ['application/json', 'text/html', 'text/markdown']) {
    const response = await handleSignedOut('/hello/__data.json', {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=600',
        vary: 'Accept',
        etag: '"inner"',
        'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
      },
      conditional: true,
      requestHeaders: {
        'if-none-match': '"inner"',
        'if-modified-since': 'Wed, 01 Jan 2025 00:00:00 GMT',
      },
      cookieNames: ['cms_unlock_00000000-0000-7000-8000-000000000001'],
      body: 'UNLOCKED-BODY-SENTINEL',
    });

    expect(await response.text()).toBe('UNLOCKED-BODY-SENTINEL');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('vary')).toContain('Accept');
    expect(response.headers.has('etag')).toBe(false);
    expect(response.headers.has('last-modified')).toBe(false);
  }

  const invalid = await handleSignedOut('/hello/__data.json', {
    status: 304,
    headers: {
      etag: '"inner"',
      'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
    },
    cookieNames: ['cms_unlock_00000000-0000-7000-8000-000000000001'],
  });

  expect(invalid.status).toBe(500);
  expect(invalid.headers.get('cache-control')).toBe('private, no-store');
  expect(invalid.headers.has('etag')).toBe(false);
  expect(invalid.headers.has('last-modified')).toBe(false);
  const headerProof = await handleSignedOut('/hello/__data.json', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=600',
    },
    requestHeaders: { 'x-cms-unlock': 'entry.proof' },
    body: 'UNLOCKED-BODY-SENTINEL',
  });

  expect(headerProof.headers.get('cache-control')).toBe('private, no-store');
  expect(headerProof.headers.get('vary')).toContain('x-cms-unlock');
  const anonymous = await handleSignedOut('/hello/__data.json', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=600',
    },
    body: 'LOCKED',
  });

  expect(anonymous.headers.get('cache-control')).toBe('private, no-store');
  expect(anonymous.headers.get('vary')).toContain('Cookie');
});

test('HTML validators revalidate changed pages without caching personalized visitors or discovery documents', async () => {
  override = ({ url }) =>
    url.pathname === '/api/v1/install/status'
      ? json({ databaseConfigured: true, setupRequired: false })
      : undefined;
  const options = {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<article>Published</article>',
  };
  const first = await handleSignedOut('/validators', options);
  const etag = first.headers.get('etag')!;

  expect(etag).toMatch(/^W\/"[a-f0-9]+"$/);
  expect(first.headers.get('last-modified')).toBeTruthy();
  expect(first.headers.get('cache-control')).toContain('must-revalidate');
  expect(first.headers.get('vary') ?? '').not.toMatch(/cookie/i);
  const cached = await handleSignedOut('/validators', {
    ...options,
    cookieNames: ['_ga'],
    requestHeaders: { 'if-none-match': etag },
  });

  expect(cached.status).toBe(304);
  expect(await cached.text()).toBe('');
  const changed = await handleSignedOut('/validators', {
    ...options,
    body: '<article>Updated</article>',
    requestHeaders: { 'if-none-match': etag },
  });

  expect(changed.status).toBe(200);
  expect(await changed.text()).toContain('Updated');

  for (const cookie of [
    'cms_session',
    '__Host-cms_session',
    'cms_unlock_entry',
    'cms_commenter',
    'cms_commenter_proof',
  ]) {
    const personal = await handleSignedOut('/validators', {
      ...options,
      cookieNames: [cookie],
      requestHeaders: { 'if-none-match': etag },
    });

    expect(personal.status).toBe(200);
    expect(personal.headers.get('cache-control')).toBe('private, no-store');
    expect(personal.headers.has('etag')).toBe(false);
  }

  const data = await handleSignedOut('/hello/__data.json', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  expect(data.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(data.headers.has('etag')).toBe(false);
});

test('canonical origin redirects safe public requests only and ignores untrusted forwarding headers', async () => {
  layoutReading = { ...reading, canonicalOrigin: true };
  layoutSeo = { ...SEO_SETTINGS_DEFAULTS, siteUrl: 'https://public.test' };
  const options = { status: 200, headers: { 'content-type': 'text/html' } };

  for (const method of ['GET', 'HEAD']) {
    const response = await handleSignedOut('/Hello?q=a%20b', {
      ...options,
      method,
      requestHeaders: {
        'x-forwarded-host': 'public.test',
        'x-forwarded-proto': 'https',
      },
    });

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://public.test/Hello?q=a%20b',
    );
  }

  for (const path of ['/login', '/health', '/healthz', '/preview/token']) {
    const response = await handleSignedOut(path, options);

    expect(response.status).toBe(200);
    expect(response.headers.has('location')).toBe(false);
  }

  layoutReading = reading;
  expect((await handleSignedOut('/Hello', options)).status).toBe(200);
});

test('related blocks request shared terms, exclude the entry and project unique unlocked links', async () => {
  override = ({ url }) => {
    if (url.pathname !== '/api/v1/content') return undefined;
    const shared = content('shared');
    const locked = { ...content('locked'), protected: true };
    const items = [shared, locked].map(
      ({ html: _html, fields: _fields, ...item }) => item,
    );

    return json({ items, total: 2, page: 1, pageSize: 3 });
  };

  const data = await loadBlockData(
    createContentClient({ baseUrl: 'http://cms.test', fetch: fakeFetch }),
    [
      {
        name: 'related-posts',
        attrs: { taxonomy: 'category', count: 3 },
        children: [],
      },
    ],
    {
      entry: {
        id: 'id-current',
        author: null,
        type: 'post',
        categories: [{ slug: 'news' }, { slug: 'guides' }],
      },
      month: null,
      authors: [],
    },
  );

  expect(data.related['category:3']).toEqual([
    { title: 'Title shared', path: '/shared' },
  ]);
  expect(calls.map(({ url }) => url.searchParams.get('category'))).toEqual([
    'news',
    'guides',
  ]);
  expect(
    calls.every(({ url }) => url.searchParams.get('exclude') === 'id-current'),
  ).toBe(true);
});

test('removed entries retain HTTP 410 and error template data is loaded only for failed pages', async () => {
  const success = await loadEntry(publicEvent('/hello', { slug: 'hello' }));

  expect(success.kind).toBe('content');
  override = ({ url }) =>
    url.pathname === '/api/v1/resolve'
      ? json({ error: { code: 'gone', message: 'Content not found' } }, 410)
      : undefined;
  await expect(
    loadEntry(publicEvent('/removed', { slug: 'removed' })),
  ).rejects.toMatchObject({
    status: 410,
  });
  expect(
    await handlePageError({
      event: publicEvent('/removed'),
      kind: 'app',
      error: { status: 410, message: 'Not found' },
    }),
  ).toMatchObject({ status: 410, themeError: { template: [], parts: [] } });
});

test('pages are framed only by the site, admin never, and keep their own opener group', async () => {
  override = ({ url }) =>
    url.pathname === '/api/v1/install/status'
      ? json({ databaseConfigured: true, setupRequired: false })
      : undefined;
  const html = { 'content-type': 'text/html; charset=utf-8' };
  const site = await handleSignedOut('/hello', { status: 200, headers: html });

  expect(site.headers.get('content-security-policy')).toBe(
    "frame-ancestors 'self'",
  );
  expect(site.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  expect(site.headers.get('cross-origin-opener-policy')).toBe('same-origin');

  const signIn = await handleSignedOut('/admin/sign-in', {
    route: '/admin/sign-in',
    status: 200,
    headers: { ...html, 'content-security-policy': "frame-ancestors 'none'" },
  });

  expect(signIn.headers.get('content-security-policy')).toBe(
    "frame-ancestors 'none'",
  );
  expect(signIn.headers.get('x-frame-options')).toBe('DENY');

  const feed = await handleSignedOut('/feed.xml', {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' },
  });

  expect(feed.headers.has('x-frame-options')).toBe(false);
  expect(feed.headers.get('x-robots-tag')).toBe('noindex, follow');
  const jsonFeed = await handleSignedOut('/feed.json', {
    route: '/feed.json',
    status: 200,
    headers: { 'content-type': 'application/feed+json; charset=utf-8' },
  });

  expect(jsonFeed.headers.get('x-robots-tag')).toBe('noindex, follow');
  const image = await handleSignedOut('/media/image.png', {
    route: '/media/[...key]',
    status: 200,
    headers: { 'content-type': 'image/png' },
  });

  expect(image.headers.has('x-robots-tag')).toBe(false);
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
      // The site's own missing page, rendered for an unknown admin path.
      if (url.pathname === '/admin/__not-found')
        return new Response('<p>site 404</p>', {
          status: 404,
          headers: {
            'content-type': 'text/html',
            'cache-control': 'max-age=60',
          },
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
    // A hidden admin screen looks exactly like any other missing page.
    if (!showLogin) expect(await response.text()).toBe('<p>site 404</p>');
    const returned = await handleSignedOut('/admin/sso/signed-out', {
      route: '/admin/sso/signed-out',
      status: 303,
      headers: { location: showLogin ? '/members/sign-in' : '/' },
    });

    expect(returned.status).toBe(303);
    expect(returned.headers.get('cache-control')).toBe('private, no-store');
  }
});
