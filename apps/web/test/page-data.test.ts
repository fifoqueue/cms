// Regression guard for the public/admin page-data boundary: what loaders and the server hook
// serialize to the browser. Sentinel values must never appear in returned data.
import { beforeEach, describe, expect, test } from 'bun:test';
import { with_request_store } from '@sveltejs/kit/internal/server';
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
  },
});

const { load: loadSiteLayout } =
  await import('#web/routes/(site)/+layout.server.js');
const { handle: handleRequest } = await import('#web/hooks.server.js');
const { load: loadHome } = await import('#web/routes/(site)/+page.server.js');
const { load: loadEntry } =
  await import('#web/routes/(site)/[slug]/+page.server.js');
const { load: loadCategory } =
  await import('#web/routes/(site)/category/[slug]/+page.server.js');
const { removeApiSecrets } = await import('#web-env');

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

/** The reading settings the layout API answers with; a test may switch to a static front page. */
let layoutReading:
  typeof reading | (typeof reading & { frontPagePath: string }) = reading;

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
      return json({ enabled: false });
    case '/api/v1/security/captcha':
      return json({ provider: 'none', siteKey: '', always: [] });
    case '/api/v1/layout':
      return json({
        site: { title: 'Site', description: '', locale: 'en' },
        seo: SEO_SETTINGS_DEFAULTS,
        theme,
        reading: layoutReading,
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
        .filter(({ url }) => url.pathname === '/api/v1/slots')
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

    expect(pages[0]).toMatchObject({ errorFallback: null });
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
  });
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
      comments: { management: unknown };
    };

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
  }
});
