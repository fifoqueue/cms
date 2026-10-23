// Regression guard for the public/admin page-data boundary: what loaders and form actions
// serialize to the browser. Sentinel values must never appear in returned data.
import { beforeEach, describe, expect, test } from 'bun:test';
import { isActionFailure } from '@sveltejs/kit';
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
  },
});

const { load: loadSiteLayout } =
  await import('#web/routes/(site)/+layout.server.js');
const { load: loadHome } = await import('#web/routes/(site)/+page.server.js');
const { load: loadEntry } =
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
const { actions: editorActions } =
  await import('#web/routes/admin/(app)/appearance/editor/+page.server.js');

const { commentAction } = await import('#lib/server/comments.js');

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
    case '/api/v1/site':
      return json({ title: 'Site', description: '', locale: 'en' });
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

const publicEvent = (
  path: string,
  params: Record<string, string> = {},
  route = '/(site)',
) =>
  ({
    fetch: fakeFetch,
    url: new URL(path, 'http://web.test'),
    route: { id: route },
    params,
    locals: forbidden('locals'),
    // Public entry reads may forward visitor proofs and an optional session to the API.
    cookies: { getAll: () => [], get: () => undefined },
    parent: async () => ({
      reading,
      theme,
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
    const footer = [{ name: 'latest-posts', attrs: { count: 5 } }];
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
    expect(entry).toMatchObject({ adjacent: { previous: null, next: null } });

    calls = [];
    expect(await loadEntry(withLayout('/topics/news'))).toMatchObject({
      kind: 'term',
    });
    const paths = calls.map(({ url }) => url.pathname);
    expect(paths.filter((path) => path === '/api/v1/slots')).toHaveLength(1);
    expect(paths).not.toContain('/api/v1/content-types');
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
  override = ({ url, body }) => {
    if (url.pathname !== '/api/v1/comments') return undefined;
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
  override = ({ url }) =>
    url.pathname === '/api/v1/comments'
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
