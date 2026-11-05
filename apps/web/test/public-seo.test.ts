// Regression guard: content text cannot break out of the JSON-LD script element.
import { expect, test } from 'bun:test';
import {
  DEFAULT_ENTRY_SEO,
  SEO_SETTINGS_DEFAULTS,
  toPublicEntrySeo,
  seoInputSchema,
} from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import { buildSiteHead, headMeta } from '#lib/seo/head.js';
import { markdownDiscoverable } from '#lib/seo/paths.js';
import { discoveryFilterSchemas } from '@cms/sdk/plugin';
import { messagesFor } from '#lib/i18n/admin.js';
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
  const head = buildSiteHead({
    messages: messagesFor(site.locale),
    site,
    locale: site.locale,
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

test('article metadata uses its public author and featured image without exposing protected text', () => {
  const page = entry({
    author: { name: 'Writer', slug: 'writer' },
    featuredImage: {
      url: '/original.jpg',
      alt: 'A landscape',
      width: 2400,
      height: 1600,
      sizes: [{ url: '/large.jpg', width: 1200 }],
    },
  });
  const render = (page: SitePage) =>
    buildSiteHead({
      messages: messagesFor(site.locale),
      site,
      locale: 'ko',
      settings: settings(),
      page,
    });
  const head = render(page);

  expect(graph(head)).toContainEqual(
    expect.objectContaining({
      '@type': 'BlogPosting',
      author: {
        '@type': 'Person',
        '@id': 'https://example.test/author/writer#person',
        name: 'Writer',
        url: 'https://example.test/author/writer',
      },
      image: [
        expect.objectContaining({
          '@type': 'ImageObject',
          url: 'https://example.test/large.jpg',
          width: 1200,
          height: 800,
        }),
      ],
    }),
  );
  expect(head.meta).toContainEqual({
    property: 'article:author',
    content: 'https://example.test/author/writer',
  });
  expect(head.meta).toContainEqual({
    property: 'og:locale',
    content: 'ko_KR',
  });
  const protectedHead = render(
    entry({
      protected: true,
      excerpt: 'Private excerpt',
      metaDescription: 'Private summary',
    }),
  );

  expect(
    protectedHead.meta.find((tag) => tag.name === 'robots')?.content,
  ).toContain('noindex');
  expect(
    protectedHead.meta.some((tag) => tag.content.includes('Private')),
  ).toBe(false);
  expect(
    protectedHead.links.some((link) => link.type === 'text/markdown'),
  ).toBe(false);
});

test('home and archive metadata preserve page identity and enumerate only the displayed posts', () => {
  const content = entry();

  if (content.kind !== 'content') throw new Error('Expected content');
  const posts = { items: [content.content], total: 3, page: 1, pageSize: 1 };
  const render = (page: SitePage) =>
    buildSiteHead({
      messages: messagesFor(site.locale),
      site,
      locale: 'en',
      settings: {
        ...settings(),
        homeTitle: 'Welcome',
        homeDescription: 'Home summary',
      },
      page,
    });
  const home = render({
    kind: 'home',
    type: 'article',
    explicitType: false,
    posts,
  });

  expect(home.title).toBe('Welcome');
  expect(home.links).toContainEqual({
    rel: 'canonical',
    href: 'https://example.test/',
  });
  const next = render({
    kind: 'home',
    type: 'article',
    explicitType: false,
    posts: { ...posts, page: 2 },
  });

  expect(next.title).toBe('Welcome – Page 2');
  expect(next.meta).toContainEqual({
    name: 'description',
    content: 'Home summary – Page 2',
  });
  expect(next.links).toContainEqual({
    rel: 'canonical',
    href: 'https://example.test/?page=2',
  });
  expect(graph(next)).toContainEqual(
    expect.objectContaining({
      '@type': 'CollectionPage',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Café',
            url: 'https://example.test/2026/01/caf%C3%A9',
          },
        ],
      },
    }),
  );
  const blog = render({
    kind: 'home',
    type: 'post',
    path: '/blog',
    title: 'Blog',
    posts,
    seo: {
      ...seo,
      title: 'Journal',
      description: 'Journal summary',
      noIndex: true,
    },
  });

  expect(blog.title).toBe('Journal · Site');
  expect(blog.meta).toContainEqual({
    name: 'description',
    content: 'Journal summary',
  });
  expect(blog.meta.find((tag) => tag.name === 'robots')?.content).toContain(
    'noindex',
  );
  const profile = render({
    kind: 'author',
    author: {
      name: 'Writer',
      slug: 'writer',
      bio: 'Writes stories',
      avatarUrl: '/avatar.jpg',
    },
    posts,
  });

  expect(graph(profile)).toContainEqual(
    expect.objectContaining({
      '@type': 'ProfilePage',
      mainEntity: {
        '@type': 'Person',
        '@id': 'https://example.test/author/writer#person',
        name: 'Writer',
        description: 'Writes stories',
        url: 'https://example.test/author/writer',
        image: 'https://example.test/avatar.jpg',
      },
    }),
  );
});

test('static front pages, missing origins and errors preserve discoverability boundaries', () => {
  const front = entry({
    type: 'page',
    path: '/',
    seo: { ...seo, canonicalUrl: 'https://example.test/' },
  });
  const input = {
    messages: messagesFor(site.locale),
    site,
    locale: 'en',
    settings: {
      ...settings(),
      homeTitle: 'Welcome',
      homeDescription: 'Home summary',
    },
    page: front,
  };
  const head = buildSiteHead(input);

  expect(head.title).toBe('Welcome');
  expect(head.meta).toContainEqual({
    name: 'description',
    content: 'Home summary',
  });
  expect(head.links.some((link) => link.type === 'text/markdown')).toBe(true);
  if (front.kind !== 'content') throw new Error('Expected content');
  expect(
    markdownDiscoverable(front.content, input.settings.siteUrl, true),
  ).toBe(true);
  const missing = buildSiteHead({
    ...input,
    page: entry(),
    settings: { ...settings(), siteUrl: '' },
  });

  expect(
    missing.links.some(
      (link) => link.rel === 'canonical' || link.type === 'text/markdown',
    ),
  ).toBe(false);
  expect(missing.meta.some((tag) => tag.property === 'og:url')).toBe(false);
  const error = buildSiteHead({
    ...input,
    page: { kind: 'error', status: 404 },
  });

  expect(error.title).toBe('Page not found · Site');
  expect(error.meta.find((tag) => tag.name === 'robots')?.content).toBe(
    'noindex, nofollow',
  );
  const feeds = buildSiteHead({
    ...input,
    settings: { ...settings(), indexingEnabled: false },
  });

  expect(feeds.links).toContainEqual(
    expect.objectContaining({
      type: 'application/feed+json',
      href: 'https://example.test/feed.json',
    }),
  );
  const disabled = buildSiteHead({
    ...input,
    settings: { ...settings(), feedsEnabled: false },
  });

  expect(
    disabled.links.some(
      (link) =>
        link.type === 'application/rss+xml' ||
        link.type === 'application/feed+json',
    ),
  ).toBe(false);
});

test('breadcrumbs use public parent trails and custom bases only when rendered visibly', () => {
  const page = entry({
    parents: [{ id: 'parent', title: 'Guides', path: '/guides' }],
  });
  const input = {
    messages: messagesFor(site.locale),
    site,
    locale: 'en',
    settings: settings(),
    page,
    archiveBases: { category: '/topics', tag: '/labels' },
  };

  expect(
    graph(buildSiteHead(input)).some(
      (node) => node['@type'] === 'BreadcrumbList',
    ),
  ).toBe(false);
  const trail = graph(
    buildSiteHead({ ...input, breadcrumbsVisible: true }),
  ).find((node) => node['@type'] === 'BreadcrumbList');

  expect(trail?.itemListElement).toEqual([
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://example.test/',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Guides',
      item: 'https://example.test/guides',
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'News',
      item: 'https://example.test/topics/news',
    },
    {
      '@type': 'ListItem',
      position: 4,
      name: 'Café',
      item: 'https://example.test/2026/01/caf%C3%A9',
    },
  ]);
  expect(
    graph(
      buildSiteHead({
        ...input,
        page: entry({ path: '/' }),
        breadcrumbsVisible: true,
      }),
    ).some((node) => node['@type'] === 'BreadcrumbList'),
  ).toBe(false);
});

test('metadata filters preserve repeated properties and safely coordinate social and crawler output', () => {
  const input = {
    site,
    locale: 'en',
    settings: settings(),
    page: entry({
      featuredImage: {
        url: '/original.jpg',
        alt: 'Original landscape',
        width: 2400,
        height: 1600,
        sizes: [{ url: '/large.jpg', width: 1200 }],
      },
    }),
  };
  const messages = messagesFor(site.locale);
  const initial = headMeta(input, messages);
  const filtered = discoveryFilterSchemas['seo.meta'].parse({
    ...initial,
    title: 'Plugin title',
    description: 'Plugin description',
    robots: 'noindex, follow',
    links: [{ rel: 'alternate', href: '/translated', title: 'Translated' }],
    og: {
      ...initial.og,
      'og:image': ['https://example.test/a.jpg', 'https://example.test/b.jpg'],
    },
  });
  const head = buildSiteHead({ ...input, messages, filtered });

  expect(
    head.meta
      .filter((tag) => tag.property === 'og:image')
      .map((tag) => tag.content),
  ).toEqual(['https://example.test/a.jpg', 'https://example.test/b.jpg']);
  expect(head.meta).toContainEqual({
    name: 'twitter:title',
    content: 'Plugin title',
  });
  expect(head.meta).toContainEqual({
    name: 'twitter:description',
    content: 'Plugin description',
  });
  expect(head.meta).toContainEqual({
    name: 'twitter:image',
    content: 'https://example.test/a.jpg',
  });
  expect(
    head.meta.some(
      (tag) =>
        tag.property?.startsWith('og:image:') ||
        tag.name === 'twitter:image:alt',
    ),
  ).toBe(false);
  const replacements = buildSiteHead({
    ...input,
    messages,
    filtered: {
      ...filtered,
      og: {
        ...filtered.og,
        'og:image:alt': 'New portrait',
        'og:image:width': '800',
        'og:image:height': '1000',
        'og:image:type': 'image/png',
      },
    },
  });

  expect(replacements.meta).toEqual(
    expect.arrayContaining([
      { property: 'og:image:alt', content: 'New portrait' },
      { property: 'og:image:width', content: '800' },
      { property: 'og:image:height', content: '1000' },
      { property: 'og:image:type', content: 'image/png' },
      { name: 'twitter:image:alt', content: 'New portrait' },
    ]),
  );
  const unchanged = buildSiteHead({
    ...input,
    messages,
    filtered: {
      ...initial,
      og: { ...initial.og, 'og:image': [String(initial.og['og:image'])] },
    },
  });

  expect(unchanged.meta).toContainEqual({
    property: 'og:image:width',
    content: '1200',
  });
  expect(head.meta).toContainEqual({
    name: 'robots',
    content: 'noindex, follow',
  });
  expect(head.links).toContainEqual({
    rel: 'alternate',
    href: '/translated',
    title: 'Translated',
  });
  expect(
    discoveryFilterSchemas['seo.meta'].safeParse({
      ...filtered,
      og: { 'og:image': ['javascript:alert(1)'] },
    }).success,
  ).toBe(false);
  expect(
    discoveryFilterSchemas['seo.meta'].safeParse({
      ...filtered,
      links: [{ rel: 'alternate', href: 'javascript:alert(1)' }],
    }).success,
  ).toBe(false);
});

test('locked views redact descriptions while proven unlocked views retain them without indexing', () => {
  const page = entry({ protected: true });

  if (page.kind !== 'content') throw new Error('Expected content');
  const secretSeo = {
    ...seo,
    description: 'Private search description',
    socialDescription: 'Private social description',
  };
  const content = {
    ...page.content,
    seo: secretSeo,
    excerpt: 'Private excerpt',
    metaDescription: 'Private summary',
  };
  const posts = { items: [], total: 0, page: 1, pageSize: 10 };
  const pages: SitePage[] = [
    { kind: 'content', content },
    { kind: 'content', content: { ...content, path: '/' } },
    { kind: 'preview', content },
    {
      kind: 'home',
      type: 'post',
      path: '/blog',
      posts,
      seo: secretSeo,
      description: 'Private excerpt',
      passwordProtected: true,
    },
  ];

  for (const page of pages) {
    const head = buildSiteHead({
      site,
      locale: 'en',
      settings: { ...settings(), homeDescription: 'Private home description' },
      messages: messagesFor('en'),
      page,
    });

    expect(JSON.stringify(head)).not.toContain('Private');
    expect(
      head.meta.some(
        (tag) =>
          tag.name === 'description' ||
          tag.property === 'og:description' ||
          tag.name === 'twitter:description',
      ),
    ).toBe(false);
  }

  const view = contentView({
    ...content,
    html: '',
    protected: true,
  } as PublicContent);

  expect(view.seo).toMatchObject({ description: '', socialDescription: '' });
  const unlocked = contentView({
    ...content,
    html: '',
    protected: false,
    passwordProtected: true,
  } as PublicContent);

  expect(unlocked.seo).toMatchObject({
    description: 'Private search description',
    socialDescription: 'Private social description',
  });
  expect(unlocked.metaDescription).toBe('Private summary');
  const automatic = { ...unlocked, seo: { ...seo, noIndex: true } };
  const unlockedPages: [SitePage, string, string][] = [
    [
      { kind: 'content', content: unlocked },
      'Private search description',
      'Private social description',
    ],
    [
      { kind: 'content', content: automatic },
      'Private summary',
      'Private summary',
    ],
    [
      { kind: 'content', content: { ...unlocked, path: '/' } },
      'Private search description',
      'Private social description',
    ],
    [
      { kind: 'preview', content: unlocked },
      'Private search description',
      'Private social description',
    ],
    [
      {
        kind: 'home',
        type: 'post',
        path: '/blog',
        posts,
        seo: secretSeo,
        passwordProtected: true,
        protected: false,
      },
      'Private search description',
      'Private social description',
    ],
    [
      {
        kind: 'home',
        type: 'post',
        path: '/blog',
        posts,
        description: 'Private summary',
        passwordProtected: true,
        protected: false,
      },
      'Private summary',
      'Private summary',
    ],
  ];

  for (const [page, description, socialDescription] of unlockedPages) {
    const head = buildSiteHead({
      site,
      locale: 'en',
      settings: settings(),
      messages: messagesFor('en'),
      page,
    });

    expect(head.meta).toEqual(
      expect.arrayContaining([
        { name: 'description', content: description },
        { property: 'og:description', content: socialDescription },
        { name: 'twitter:description', content: socialDescription },
      ]),
    );
    expect(head.meta.find((tag) => tag.name === 'robots')?.content).toContain(
      'noindex',
    );
  }
});

test('paginated author, content-type and date breadcrumb URLs identify the displayed page', () => {
  const posts = { items: [], total: 30, page: 2, pageSize: 10 };
  const cases: [SitePage, string][] = [
    [
      {
        kind: 'author',
        author: { name: 'Writer', slug: 'writer', bio: '' },
        posts,
      },
      '/author/writer?page=2',
    ],
    [
      {
        kind: 'archive',
        archive: { key: 'article', name: 'Articles', description: '' },
        posts,
      },
      '/archive/article?page=2',
    ],
    [
      { kind: 'date', date: { year: 2026, month: 3, day: 5 }, posts },
      '/date/2026/03/05?page=2',
    ],
  ];

  for (const [page, path] of cases) {
    const head = buildSiteHead({
      site,
      locale: 'en',
      settings: settings(),
      messages: messagesFor('en'),
      page,
      breadcrumbsVisible: true,
    });
    const trail = graph(head).find((node) => node['@type'] === 'BreadcrumbList')
      ?.itemListElement as { item: string }[];

    expect(trail.at(-1)?.item).toBe(`https://example.test${path}`);
    expect(
      trail.slice(0, -1).every(({ item }) => !item.includes('?page=')),
    ).toBe(true);
  }
});

test('entry schema choices reject unsupported collections while legacy values remain readable as webpages', () => {
  expect(
    seoInputSchema.safeParse({ schemaType: 'CollectionPage' }).success,
  ).toBe(false);
  const legacy = toPublicEntrySeo({ ...seo, schemaType: 'CollectionPage' });
  const head = buildSiteHead({
    site,
    locale: 'en',
    settings: settings(),
    messages: messagesFor('en'),
    page: entry({ seo: legacy }),
  });

  expect(graph(head)).toContainEqual(
    expect.objectContaining({
      '@type': 'WebPage',
      name: 'Café',
    }),
  );
});
