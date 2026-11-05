import { termTarget } from '#lib/theme/pagination.js';
// The single metadata set of every public page: title, meta, links and JSON-LD, built from
// explicitly projected page data only. Pure, so SSR and client navigation render the same tags.
// Absolute URLs come only from the configured site origin, never from the request host.
import type {
  ArchiveBases,
  Block,
  PublicEntrySeo,
  TaxonomyType,
} from '@cms/sdk';
// Not the `@cms/sdk` root: its schema modules would ship Zod to every public page.
import { formatSeoTitle } from '@cms/sdk/format';
import { walkBlocks } from '@cms/sdk/block-tree';
import type {
  ContentView,
  PostList,
  SeoSettingsView,
  SiteView,
  TermArchiveView,
} from '#lib/server/public-view.js';
import type { SiteMessages } from '#lib/i18n/site.js';
import { jsonLdScript } from '#lib/seo/json-ld.js';
import {
  FEED_PATH,
  JSON_FEED_PATH,
  LLMS_TXT_PATH,
  SITEMAP_PATH,
  crumbPath,
  datePath,
  feedPath,
  listingPath,
  markdownPath,
  markdownDiscoverable,
  oembedPath,
} from '#lib/seo/paths.js';
import type { CrumbTarget, FeedTarget } from '#lib/seo/paths.js';
import { lastPageOf } from '#lib/theme/pagination.js';
import type { HomeListType, ListingTarget } from '#lib/theme/pagination.js';

/** What each public page loader returns for the head; `kind` selects the page type. */
export type SitePage =
  /** `path` and `title` belong to the posts page when the front page is static. */
  | {
      kind: 'home';
      type: HomeListType;
      posts: PostList;
      path?: string;
      title?: string;
      explicitType?: boolean;
      seo?: PublicEntrySeo;
      description?: string;
      passwordProtected?: boolean;
      protected?: boolean;
      featuredImage?: ContentView['featuredImage'];
    }
  | {
      kind: 'date';
      date: { year: number; month: number | null; day?: number };
      posts: PostList;
    }
  | { kind: 'search'; query: string; posts: PostList | null }
  | { kind: 'term'; term: TermArchiveView; posts: PostList }
  | { kind: 'content'; content: ContentView }
  | { kind: 'author'; author: AuthorView; posts: PostList }
  | {
      kind: 'archive';
      archive: { key: string; name: string; description: string };
      posts: PostList;
    }
  | { kind: 'login' }
  | { kind: 'error'; status: number }
  /** Turning off comment notifications from an emailed link: never indexed. */
  | { kind: 'unsubscribe' }
  /** Unpublished changes: described like content, never indexed or canonical. */
  | { kind: 'preview'; content: ContentView };

/** A public author archive. */
export interface AuthorView {
  name: string;
  slug: string;
  bio: string;
  avatarUrl?: string | null;
}

const KINDS: readonly unknown[] = [
  'home',
  'search',
  'term',
  'content',
  'author',
  'archive',
  'date',
  'preview',
  'login',
  'unsubscribe',
  'error',
];

/** The page part of merged page data, or `null` when the page describes nothing. */
export const sitePage = (data: Record<string, unknown>): SitePage | null =>
  KINDS.includes(data.kind) ? (data as unknown as SitePage) : null;

type Entry = Pick<ContentView, 'type' | 'seo'>;

/** `auto` marks pages as WebPage, articles as Article and posts as BlogPosting. */
export const schemaType = ({ type, seo }: Entry) =>
  seo.schemaType !== 'auto'
    ? seo.schemaType
    : type === 'page'
      ? 'WebPage'
      : type === 'article'
        ? 'Article'
        : 'BlogPosting';

/** Articles show a byline and dates, and only they are marked up as Article/BlogPosting. */
export const isArticle = (entry: Entry) =>
  ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'].includes(
    schemaType(entry),
  );

export const termLabel = (taxonomy: TaxonomyType, m: SiteMessages) =>
  taxonomy === 'category'
    ? m.themeCategory
    : taxonomy === 'tag'
      ? m.themeTag
      : taxonomy;

export interface Crumb {
  name: string;
  target: CrumbTarget;
}

/** The visible breadcrumb trail; the JSON-LD BreadcrumbList uses the same list. */
export const crumbs = (page: SitePage | null, m: SiteMessages): Crumb[] => {
  const home: Crumb = { name: m.themeHome, target: { kind: 'home' } };
  const step = (name: string, path: string): Crumb => ({
    name,
    target: { kind: 'content', path },
  });

  if (page?.kind === 'author')
    return [
      home,
      step(
        page.author.name,
        listingPath({ kind: 'author', slug: page.author.slug }),
      ),
    ];
  if (page?.kind === 'archive')
    return [
      home,
      step(
        page.archive.name,
        listingPath({ kind: 'archive', slug: page.archive.key }),
      ),
    ];

  if (page?.kind === 'date') {
    const { year, month, day } = page.date;

    return [
      home,
      step(String(year), datePath(year, null)),
      ...(month
        ? [step(String(month).padStart(2, '0'), datePath(year, month))]
        : []),
      ...(day
        ? [step(String(day).padStart(2, '0'), datePath(year, month, day))]
        : []),
    ];
  }

  if (page?.kind === 'term')
    return [
      home,
      ...(page.term.parents ?? []).map((parent): Crumb => ({
        name: parent.name,
        target:
          page.term.taxonomy === 'category' || page.term.taxonomy === 'tag'
            ? { kind: page.term.taxonomy, slug: parent.slug }
            : {
                kind: 'taxonomy',
                taxonomy: page.term.taxonomy,
                slug: parent.slug,
              },
      })),
      {
        name: page.term.name,
        target: page.term.path
          ? { kind: 'content', path: page.term.path }
          : page.term.taxonomy === 'category' || page.term.taxonomy === 'tag'
            ? { kind: page.term.taxonomy, slug: page.term.slug }
            : {
                kind: 'taxonomy',
                taxonomy: page.term.taxonomy,
                slug: page.term.slug,
              },
      },
    ];
  if (page?.kind !== 'content') return [];
  const { content } = page;

  if (content.path === '/') return [home];
  const category = isArticle(content) ? content.categories[0] : undefined;

  return [
    home,
    ...content.parents
      .filter((parent) => parent.path !== '/')
      .map((parent) => step(parent.title, parent.path)),
    ...(category
      ? content.categoryParents.map((parent): Crumb => ({
          name: parent.name,
          target: { kind: 'category', slug: parent.slug },
        }))
      : []),
    ...(category
      ? [
          {
            name: category.name,
            target: { kind: 'category', slug: category.slug },
          } satisfies Crumb,
        ]
      : []),
    { name: content.title, target: { kind: 'content', path: content.path } },
  ];
};

/** Only the selected template and its included parts can publish a visible trail. */
export const hasBreadcrumbs = (
  template: readonly Block[] = [],
  parts: readonly { blocks: Block[] }[] = [],
) =>
  [...walkBlocks([...template, ...parts.flatMap((part) => part.blocks)])].some(
    (block) => block.name === 'breadcrumbs',
  );

export interface HeadMeta {
  name?: string;
  property?: string;
  content: string;
}

export interface HeadLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
}

export interface Head {
  title: string;
  meta: HeadMeta[];
  links: HeadLink[];
  /** A complete, escaped `<script type="application/ld+json">` element. */
  jsonLd: string;
}

interface Image {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  type?: string;
}

/** Per-page facts before site-wide settings apply. Paths are root-relative. */
interface Facts {
  title: string;
  /** The page's visible name. */
  name: string;
  description: string;
  socialTitle: string;
  socialDescription: string;
  /** Own path; `null` for pages that are never canonical (search). */
  path: string | null;
  canonical: string;
  index: boolean;
  follow: boolean;
  type:
    | 'WebPage'
    | 'CollectionPage'
    | 'SearchResultsPage'
    | 'ProfilePage'
    | 'AboutPage'
    | 'ContactPage';
  /** Sharing image chosen for this page. */
  image: Image | null;
  /** Image shown on the page itself (the only one JSON-LD may claim). */
  pageImage: Image | null;
  prev?: string;
  next?: string;
}

const pagedIn = (m: SiteMessages) => (title: string, page: number) =>
  page > 1 ? m.themePaged(title, page) : title;

const pagination = (target: ListingTarget, posts: PostList) => {
  const last = lastPageOf(posts);

  return {
    path: listingPath(target, posts.page),
    prev:
      posts.page > 1
        ? listingPath(target, Math.min(posts.page - 1, last))
        : undefined,
    next: posts.page < last ? listingPath(target, posts.page + 1) : undefined,
    inRange: posts.page <= last,
  };
};

/** Responsive sizes preserve the original aspect ratio. */
export const sharingImage = (
  image: ContentView['featuredImage'] | undefined,
  siteUrl: string,
): Image | null => {
  if (!image || !siteUrl) return null;
  const candidates = [
    ...image.sizes,
    ...(image.width ? [{ url: image.url, width: image.width }] : []),
  ].sort((a, b) => Math.abs(a.width - 1200) - Math.abs(b.width - 1200));
  const chosen = candidates[0];
  const url = chosen?.url ?? image.url;
  const width = chosen?.width ?? image.width ?? undefined;
  const height =
    image.width && image.height && width
      ? Math.round((image.height * width) / image.width)
      : undefined;
  const extension = new URL(url, siteUrl).pathname
    .split('.')
    .pop()
    ?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    gif: 'image/gif',
  };

  return {
    url: new URL(url, siteUrl).href,
    alt: image.alt,
    width,
    height,
    type: types[extension ?? ''],
  };
};

const describe = (
  site: SiteView,
  settings: SeoSettingsView,
  page: SitePage | null,
  absolute: (path: string) => string,
  m: SiteMessages,
): Facts => {
  const paged = pagedIn(m);
  const format = (title: string) =>
    formatSeoTitle(title, site.title, settings.titleTemplate);
  const listing = { image: null, pageImage: null, follow: true } as const;

  switch (page?.kind) {
    case 'home': {
      const seo = page.seo;
      const locked = page.protected ?? page.passwordProtected;
      const list = pagination(
        {
          kind: 'home',
          type: page.explicitType === false ? 'post' : page.type,
          path: page.path,
        },
        page.posts,
      );
      const front =
        !page.path && (page.explicitType === false || page.type === 'post');
      const social = paged(
        front
          ? settings.homeTitle || site.title
          : seo?.title ||
              page.title ||
              (page.type === 'article' ? m.themeArticles : m.themePosts),
        page.posts.page,
      );
      const description = locked
        ? ''
        : paged(
            front
              ? settings.homeDescription || site.description
              : seo?.description ||
                  page.description ||
                  `${page.title || (page.type === 'article' ? m.themeArticles : m.themePosts)} · ${site.title}`,
            page.posts.page,
          );

      return {
        ...listing,
        ...list,
        title: front ? social : format(social),
        name:
          page.title ??
          (page.type === 'article' ? m.themeArticles : site.title),
        description,
        socialTitle: seo?.socialTitle
          ? paged(seo.socialTitle, page.posts.page)
          : social,
        socialDescription: locked
          ? ''
          : seo?.socialDescription
            ? paged(seo.socialDescription, page.posts.page)
            : description,
        canonical:
          (page.posts.page === 1 && seo?.canonicalUrl) || absolute(list.path),
        index:
          list.inRange && !seo?.noIndex && !page.passwordProtected && !locked,
        follow: !seo?.noFollow,
        image: seo?.imageUrl
          ? { url: seo.imageUrl, alt: seo.imageAlt }
          : sharingImage(page.featuredImage, settings.siteUrl),
        type: 'CollectionPage',
      };
    }

    case 'search': {
      const list = page.posts
        ? pagination({ kind: 'search', query: page.query }, page.posts)
        : null;
      const social = paged(
        page.query ? m.themeSearchTitle(page.query) : m.themeSearch,
        page.posts?.page ?? 1,
      );

      return {
        ...listing,
        title: format(social),
        name: page.query ? m.themeSearchResults(page.query) : m.themeSearch,
        description: '',
        socialTitle: social,
        socialDescription: '',
        path: null,
        canonical: '',
        index: false,
        type: 'SearchResultsPage',
        prev: list?.prev,
        next: list?.next,
      };
    }

    case 'term': {
      const { term, posts } = page;
      const list = pagination(
        termTarget(term.taxonomy, term.slug, term.path),
        posts,
      );
      const base = paged(
        term.seo.title || `${termLabel(term.taxonomy, m)}: ${term.name}`,
        posts.page,
      );
      const description = paged(
        term.seo.description ||
          term.description ||
          `${termLabel(term.taxonomy, m)}: ${term.name} · ${site.title}`,
        posts.page,
      );
      const indexed =
        term.taxonomy === 'category'
          ? settings.indexCategories
          : settings.indexTags;

      return {
        ...list,
        title: format(base),
        name: term.name,
        description,
        socialTitle: term.seo.socialTitle
          ? paged(term.seo.socialTitle, posts.page)
          : base,
        socialDescription: term.seo.socialDescription
          ? paged(term.seo.socialDescription, posts.page)
          : description,
        canonical:
          (posts.page === 1 && term.seo.canonicalUrl) || absolute(list.path),
        index: indexed && !term.seo.noIndex && posts.total > 0 && list.inRange,
        follow: !term.seo.noFollow,
        type: 'CollectionPage',
        image: term.seo.imageUrl
          ? { url: term.seo.imageUrl, alt: term.seo.imageAlt }
          : null,
        pageImage: null,
      };
    }

    case 'author': {
      const { author, posts } = page;
      const seo = settings.archiveOverrides.find(
        (value) => value.kind === 'author' && value.key === author.slug,
      );
      const list = pagination({ kind: 'author', slug: author.slug }, posts);
      const base = paged(seo?.title || author.name, posts.page);
      const description = paged(
        seo?.description ||
          author.bio ||
          `${m.authorArchive(author.name)} · ${site.title}`,
        posts.page,
      );

      return {
        ...listing,
        ...list,
        title: format(base),
        name: author.name,
        description,
        socialTitle: base,
        socialDescription: description,
        canonical: absolute(list.path),
        index: !seo?.noIndex && posts.total > 0 && list.inRange,
        image: seo?.imageUrl ? { url: seo.imageUrl, alt: author.name } : null,
        type: 'ProfilePage',
      };
    }

    case 'archive': {
      const { archive, posts } = page;
      const seo = settings.archiveOverrides.find(
        (value) => value.kind === 'archive' && value.key === archive.key,
      );
      const list = pagination({ kind: 'archive', slug: archive.key }, posts);
      const base = paged(seo?.title || archive.name, posts.page);
      const description = paged(
        seo?.description ||
          archive.description ||
          `${archive.name} · ${site.title}`,
        posts.page,
      );

      return {
        ...listing,
        ...list,
        title: format(base),
        name: archive.name,
        description,
        socialTitle: base,
        socialDescription: description,
        canonical: absolute(list.path),
        index: !seo?.noIndex && posts.total > 0 && list.inRange,
        image: seo?.imageUrl ? { url: seo.imageUrl, alt: archive.name } : null,
        type: 'CollectionPage',
      };
    }

    case 'date': {
      const { date, posts } = page;
      const list = pagination({ kind: 'date', ...date }, posts);
      const name = date.day
        ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
        : date.month
          ? `${date.year}-${String(date.month).padStart(2, '0')}`
          : String(date.year);
      const base = paged(name, posts.page);
      const description = paged(
        `${m.themePosts}: ${name} · ${site.title}`,
        posts.page,
      );

      // Date archives repeat what other listings show, so they are never indexed.
      return {
        ...listing,
        ...list,
        title: format(base),
        name,
        description,
        socialTitle: base,
        socialDescription: description,
        canonical: absolute(list.path),
        index: false,
        type: 'CollectionPage',
      };
    }

    case 'preview':
      return {
        ...describe(
          site,
          settings,
          { kind: 'content', content: page.content },
          absolute,
          m,
        ),
        canonical: '',
        index: false,
        follow: false,
      };
    case 'error':
    case 'login':
    case 'unsubscribe': {
      const name =
        page.kind === 'error'
          ? page.status === 404 || page.status === 410
            ? m.themeNotFound
            : m.errorPageServer
          : page.kind === 'login'
            ? m.signInTitle
            : m.commentUnsubscribeTitle;

      return {
        ...listing,
        title: format(name),
        name,
        description: '',
        socialTitle: name,
        socialDescription: '',
        path: null,
        canonical: '',
        index: false,
        follow: false,
        type: 'WebPage',
      };
    }

    case 'content': {
      const { content } = page;
      const protectedEntry = content.passwordProtected || content.protected;
      // Every part of a split entry is canonical to itself.
      const { current, total } = content.pages;
      const partPath = (part: number) =>
        part > 1 ? `${content.path}?page=${part}` : content.path;
      const front = content.path === '/';
      const base = paged(
        (front && settings.homeTitle) || content.seo.title || content.title,
        current,
      );
      const description = content.protected
        ? ''
        : paged(
            (front && settings.homeDescription) ||
              content.seo.description ||
              content.metaDescription ||
              content.excerpt ||
              site.description,
            current,
          );
      // An explicit SEO image wins; otherwise the featured image, when the site has an address.
      const featured = sharingImage(content.featuredImage, settings.siteUrl);
      const image = content.seo.imageUrl
        ? { url: content.seo.imageUrl, alt: content.seo.imageAlt }
        : featured;

      return {
        title: front ? base : format(base),
        name: content.title,
        description,
        socialTitle: content.seo.socialTitle
          ? paged(content.seo.socialTitle, current)
          : base,
        socialDescription: content.protected
          ? ''
          : content.seo.socialDescription
            ? paged(content.seo.socialDescription, current)
            : description,
        path: partPath(current),
        canonical:
          (current === 1 && content.seo.canonicalUrl) ||
          absolute(partPath(current)),
        prev: current > 1 ? partPath(current - 1) : undefined,
        next: current < total ? partPath(current + 1) : undefined,
        index: !content.seo.noIndex && !protectedEntry,
        follow: !content.seo.noFollow,
        type: isArticle(content)
          ? 'WebPage'
          : (schemaType(content) as Facts['type']),
        image,
        pageImage: image,
      };
    }

    default:
      return {
        ...listing,
        title: site.title,
        name: site.title,
        description: site.description,
        socialTitle: site.title,
        socialDescription: site.description,
        path: null,
        canonical: '',
        index: true,
        type: 'WebPage',
      };
  }
};

/** CLDR supplies the default region for language-only tags. */
const ogLocale = (locale: string) => {
  const tag = new Intl.Locale(locale.replaceAll('_', '-')).maximize();

  return tag.region ? `${tag.language}_${tag.region}` : '';
};

const robots = (
  settings: SeoSettingsView,
  index: boolean,
  follow: boolean,
  seo?: PublicEntrySeo,
) =>
  [
    index ? 'index' : 'noindex',
    follow ? 'follow' : 'nofollow',
    ...(index
      ? [
          ...(seo?.noSnippet
            ? ['nosnippet']
            : [`max-snippet:${seo?.maxSnippet ?? settings.maxSnippet}`]),
          `max-image-preview:${seo?.maxImagePreview ?? settings.maxImagePreview}`,
          `max-video-preview:${settings.maxVideoPreview}`,
        ]
      : []),
  ].join(', ');

/** Drops absent values so JSON-LD never carries empty claims. */
const compact = (node: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(node).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );

/** What the head is built from. */
export interface HeadInput {
  site: SiteView;
  /** The language tag the page is shown in (`og:locale`, `inLanguage`). */
  locale: string;
  settings: SeoSettingsView;
  page: SitePage | null;
  archiveBases?: ArchiveBases;
  breadcrumbsVisible?: boolean;
  images?: Record<string, NonNullable<ContentView['featuredImage']>>;
}

/**
 * The `seo.meta` discovery filter value: presentation data plugins may adjust before the
 * head escapes it. Repeated `og:*` properties retain all values; a page without a
 * canonical URL submits `/` (`NO_CANONICAL`), which keeps it without one.
 */
export interface SeoMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  og: Record<string, string | string[]>;
  robots?: string;
  links?: HeadLink[];
  jsonLd: unknown[];
}

const NO_CANONICAL = '/';

interface HeadParts {
  title: string;
  meta: HeadMeta[];
  links: HeadLink[];
  graph: unknown[];
}

const isOg = (tag: HeadMeta) => tag.property?.startsWith('og:') ?? false;

/** The filter value of a head. */
const seoMetaOf = ({ title, meta, links, graph }: HeadParts): SeoMeta => {
  const og: Record<string, string | string[]> = {};

  for (const tag of meta) {
    if (!isOg(tag)) continue;
    const previous = og[tag.property!];

    og[tag.property!] =
      previous === undefined
        ? tag.content
        : [...(Array.isArray(previous) ? previous : [previous]), tag.content];
  }

  return {
    title,
    description: meta.find((tag) => tag.name === 'description')?.content ?? '',
    canonicalUrl:
      links.find((link) => link.rel === 'canonical')?.href ?? NO_CANONICAL,
    og,
    robots: meta.find((tag) => tag.name === 'robots')?.content ?? '',
    links: links.filter((link) => link.rel !== 'canonical'),
    jsonLd: graph,
  };
};

/** The head with a filtered value applied; the head escapes it as usual. */
const applyMeta = (parts: HeadParts, filtered: SeoMeta): HeadParts => {
  const original = seoMetaOf(parts);
  const values = { ...filtered.og };
  const list = (value: string | string[] | undefined) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];
  const changed = (key: string) =>
    JSON.stringify(list(values[key])) !==
    JSON.stringify(list(original.og[key]));

  if (changed('og:image')) {
    for (const key of Object.keys(values)) {
      if (
        key.startsWith('og:image:') &&
        (!list(values['og:image']).length || !changed(key))
      )
        delete values[key];
    }
  }

  if (
    filtered.title !== original.title &&
    values['og:title'] === original.og['og:title']
  )
    values['og:title'] = filtered.title;
  if (
    filtered.description !== original.description &&
    values['og:description'] === original.og['og:description']
  )
    values['og:description'] = filtered.description;
  const description: HeadMeta[] = filtered.description
    ? [{ name: 'description', content: filtered.description }]
    : [];
  const og = Object.entries(values)
    .filter(([key]) => key.startsWith('og:'))
    .flatMap(([property, value]) =>
      (Array.isArray(value) ? value : [value]).map((content) => ({
        property,
        content,
      })),
    );
  const first = (key: string) => {
    const value = values[key];

    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  };
  const mirrors: Record<string, string> = {
    'twitter:title': first('og:title'),
    'twitter:description': first('og:description'),
    'twitter:image': first('og:image'),
    'twitter:image:alt': first('og:image:alt'),
    'twitter:card': first('og:image') ? 'summary_large_image' : 'summary',
    robots: filtered.robots ?? original.robots ?? '',
  };
  const rest = [
    ...parts.meta.filter(
      (tag) => tag.name !== 'description' && !(tag.name && tag.name in mirrors),
    ),
    ...Object.entries(mirrors)
      .filter(([, content]) => content)
      .map(([name, content]) => ({ name, content })),
  ];
  const at = rest.findIndex(isOg);
  const others = rest.filter((tag) => !isOg(tag));
  const ogAt = at < 0 ? others.length : at;
  const canonical =
    filtered.canonicalUrl === NO_CANONICAL &&
    original.canonicalUrl === NO_CANONICAL
      ? []
      : [{ rel: 'canonical', href: filtered.canonicalUrl }];

  return {
    title: filtered.title,
    meta: [
      ...description,
      ...others.slice(0, ogAt),
      ...og,
      ...others.slice(ogAt),
    ],
    links: [
      ...canonical,
      ...(filtered.links ?? parts.links).filter(
        (link) => link.rel !== 'canonical',
      ),
    ],
    graph: filtered.jsonLd,
  };
};

/** The `seo.meta` filter value of a page, for the server to submit. */
export const headMeta = (input: HeadInput, messages: SiteMessages) =>
  seoMetaOf(headParts(input, messages));

/**
 * The page's head. `filtered` is the page's `seo.meta` filter result (page data `seoMeta`,
 * set by the server only when a plugin changed something).
 */
export const buildSiteHead = ({
  messages,
  filtered,
  ...input
}: HeadInput & {
  messages: SiteMessages;
  filtered?: SeoMeta | null;
}): Head => {
  const parts = headParts(input, messages);
  const { title, meta, links, graph } = filtered
    ? applyMeta(parts, filtered)
    : parts;
  const protectedPolicy =
    !input.settings.indexingEnabled ||
    input.page?.kind === 'preview' ||
    input.page?.kind === 'error' ||
    (input.page?.kind === 'home' && input.page.passwordProtected) ||
    (input.page?.kind === 'content' &&
      (input.page.content.passwordProtected || input.page.content.protected));

  return {
    title,
    meta: protectedPolicy
      ? [
          ...meta.filter((tag) => tag.name !== 'robots'),
          ...parts.meta.filter((tag) => tag.name === 'robots'),
        ]
      : meta,
    links,
    jsonLd: jsonLdScript({ '@context': 'https://schema.org', '@graph': graph }),
  };
};

const headParts = (
  {
    site,
    locale,
    settings,
    page,
    archiveBases,
    breadcrumbsVisible = false,
    images,
  }: HeadInput,
  m: SiteMessages,
): HeadParts => {
  const absolute = (path: string) =>
    settings.siteUrl ? `${settings.siteUrl}${path}` : '';
  const href = (path: string) => absolute(path) || path;
  const facts = describe(site, settings, page, absolute, m);
  const content = page?.kind === 'content' ? page.content : null;
  const article = content && isArticle(content) ? content : null;
  const index = settings.indexingEnabled && facts.index;
  const follow = settings.indexingEnabled && facts.follow;
  const selfUrl = facts.path === null ? '' : absolute(facts.path);
  const selectedImage: Image | null =
    facts.image ??
    (settings.defaultImageUrl
      ? { url: settings.defaultImageUrl, alt: settings.defaultImageAlt }
      : null);
  const metadata = selectedImage ? images?.[selectedImage.url] : undefined;
  const variant = metadata && sharingImage(metadata, settings.siteUrl);
  const image =
    variant && selectedImage
      ? { ...variant, alt: selectedImage.alt || variant.alt }
      : selectedImage;
  const pageImage = facts.pageImage ? image : null;
  const imageAlt = image ? image.alt || facts.socialTitle : '';

  const meta: HeadMeta[] = [];
  const name = (key: string, value: string) => {
    if (value) meta.push({ name: key, content: value });
  };
  const property = (key: string, value: string) => {
    if (value) meta.push({ property: key, content: value });
  };

  name('description', facts.description);
  const entrySeo =
    content?.seo ??
    (page?.kind === 'term'
      ? page.term.seo
      : page?.kind === 'home'
        ? page.seo
        : undefined);

  name('robots', robots(settings, index, follow, entrySeo));
  name('google-site-verification', settings.googleVerification);
  name('msvalidate.01', settings.bingVerification);
  property(
    'og:type',
    article ? 'article' : page?.kind === 'author' ? 'profile' : 'website',
  );
  property('og:site_name', site.title);
  property('og:locale', ogLocale(locale));
  property('og:title', facts.socialTitle);
  property('og:description', facts.socialDescription);
  property('og:url', facts.canonical);

  if (image) {
    property('og:image', image.url);
    property('og:image:alt', imageAlt);
    property('og:image:width', image.width ? String(image.width) : '');
    property('og:image:height', image.height ? String(image.height) : '');
    property('og:image:type', image.type ?? '');
  }

  if (article) {
    property('article:published_time', article.publishedAt);
    property('article:modified_time', article.updatedAt);
    property(
      'article:author',
      article.seo.authorUrl ||
        (article.author
          ? absolute(listingPath({ kind: 'author', slug: article.author.slug }))
          : ''),
    );
    property('article:section', article.categories[0]?.name ?? '');
    for (const tag of article.tags) property('article:tag', tag.name);
  }

  if (content) property('og:updated_time', content.updatedAt);

  name('twitter:card', image ? 'summary_large_image' : 'summary');
  name('twitter:site', settings.twitterHandle);
  name('twitter:creator', settings.twitterCreator || settings.twitterHandle);
  name('twitter:title', facts.socialTitle);
  name('twitter:description', facts.socialDescription);

  if (image) {
    name('twitter:image', image.url);
    name('twitter:image:alt', imageAlt);
  }

  const links: HeadLink[] = [];

  if (facts.canonical) links.push({ rel: 'canonical', href: facts.canonical });
  if (facts.prev) links.push({ rel: 'prev', href: href(facts.prev) });
  if (facts.next) links.push({ rel: 'next', href: href(facts.next) });
  // Discovery documents are linked only where their routes serve them.
  const discoverable = settings.indexingEnabled && settings.siteUrl !== '';

  if (discoverable)
    links.push({
      rel: 'sitemap',
      type: 'application/xml',
      href: href(SITEMAP_PATH),
    });

  // The feed route answers only while discoverable; narrowed feeds follow archives.
  if (settings.feedsEnabled && settings.siteUrl) {
    links.push({
      rel: 'alternate',
      type: 'application/rss+xml',
      title: site.title,
      href: href(FEED_PATH),
    });
    links.push({
      rel: 'alternate',
      type: 'application/feed+json',
      title: site.title,
      href: href(JSON_FEED_PATH),
    });
    const term = page?.kind === 'term' ? page.term : null;
    const followed: (FeedTarget & { name: string }) | null =
      page?.kind === 'author'
        ? { kind: 'author', slug: page.author.slug, name: page.author.name }
        : term
          ? {
              kind:
                term.taxonomy === 'category' || term.taxonomy === 'tag'
                  ? term.taxonomy
                  : 'taxonomy',
              taxonomy: term.taxonomy,
              slug: term.slug,
              name: term.name,
            }
          : page?.kind === 'archive'
            ? {
                kind: 'archive',
                slug: page.archive.key,
                name: page.archive.name,
              }
            : null;

    if (followed)
      for (const format of ['rss', 'json'] as const)
        links.push({
          rel: 'alternate',
          type:
            format === 'rss' ? 'application/rss+xml' : 'application/feed+json',
          title: m.themeFeedTitle(site.title, followed.name),
          href: href(feedPath(followed, format)),
        });
  }

  if (discoverable && settings.llmsTxtEnabled)
    links.push({
      rel: 'describedby',
      type: 'text/plain',
      href: href(LLMS_TXT_PATH),
    });
  if (content && markdownDiscoverable(content, settings.siteUrl, index))
    links.push({
      rel: 'alternate',
      type: 'text/markdown',
      title: content.title,
      href: href(markdownPath(content.slug)),
    });
  // oEmbed discovery, so other sites can embed this entry as a card.
  if (content && !content.protected && selfUrl)
    links.push({
      rel: 'alternate',
      type: 'application/json+oembed',
      title: content.title,
      href: absolute(oembedPath(selfUrl)),
    });

  // Without a configured origin, nodes are linked by blank-node ids instead of invented URLs.
  const id = (path: string, key: string) =>
    settings.siteUrl ? `${absolute(path)}#${key}` : `_:${key}`;
  const ref = (key: string) => ({ '@id': key });
  const person = settings.entityType === 'Person';
  // The custom logo stands in for an SEO logo, as an absolute URL only.
  const logoUrl =
    settings.logoUrl || (site.logo ? absolute(site.logo.url) : '');
  const identityName = settings.entityName || (person ? '' : site.title);
  const identityId = id('/', person ? 'person' : 'organization');
  const publisher = identityName ? ref(identityId) : undefined;
  const websiteId = id('/', 'website');
  const pageId = facts.path === null ? '_:webpage' : id(facts.path, 'webpage');
  const trail = crumbs(page, m);
  const breadcrumbId = id(facts.path ?? '/', 'breadcrumb');
  const breadcrumb =
    settings.siteUrl && breadcrumbsVisible && trail.length > 1
      ? {
          '@type': 'BreadcrumbList',
          '@id': breadcrumbId,
          itemListElement: trail.map((crumb, position) => ({
            '@type': 'ListItem',
            position: position + 1,
            name: crumb.name,
            item: absolute(
              position === trail.length - 1 && facts.path
                ? facts.path
                : crumbPath(crumb.target, archiveBases),
            ),
          })),
        }
      : null;

  const author = page?.kind === 'author' ? page.author : content?.author;
  const authorPath = author
    ? listingPath({ kind: 'author', slug: author.slug })
    : '';
  const authorEntity = author
    ? compact({
        '@type': 'Person',
        '@id': id(authorPath, 'person'),
        name: author.name,
        url: absolute(authorPath),
        description: 'bio' in author ? author.bio : undefined,
        image:
          'avatarUrl' in author &&
          typeof author.avatarUrl === 'string' &&
          author.avatarUrl &&
          settings.siteUrl
            ? new URL(author.avatarUrl, settings.siteUrl).href
            : undefined,
      })
    : undefined;
  const posts = page && 'posts' in page ? page.posts : null;
  const itemList =
    posts && settings.siteUrl
      ? {
          '@type': 'ItemList',
          itemListElement: posts.items.map((post, position) => ({
            '@type': 'ListItem',
            position: position + 1,
            url: absolute(post.path),
            name: post.title,
          })),
        }
      : undefined;
  const imageObject = (image: Image) =>
    compact({
      '@type': 'ImageObject',
      url: image.url,
      width: image.width,
      height: image.height,
      caption: image.alt,
    });
  const graph = [
    compact({
      '@type': 'WebSite',
      '@id': websiteId,
      url: absolute('/'),
      name: site.title,
      alternateName: settings.alternateName,
      description: site.description,
      inLanguage: locale,
      publisher,
      potentialAction: settings.siteUrl
        ? {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${absolute('/')}?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          }
        : undefined,
    }),
    identityName
      ? compact({
          '@type': settings.entityType,
          '@id': identityId,
          name: identityName,
          description: site.description,
          url: absolute('/'),
          [person ? 'image' : 'logo']: logoUrl
            ? { '@type': 'ImageObject', url: logoUrl }
            : undefined,
          sameAs: settings.sameAs,
        })
      : null,
    page
      ? compact({
          '@type': facts.type,
          '@id': pageId,
          url: selfUrl,
          name: facts.name,
          description: facts.description,
          isPartOf: ref(websiteId),
          inLanguage: locale,
          datePublished: content?.publishedAt,
          dateModified: content?.updatedAt,
          mainEntity:
            page.kind === 'author'
              ? authorEntity
              : facts.type === 'CollectionPage'
                ? itemList
                : undefined,
          breadcrumb: breadcrumb ? ref(breadcrumbId) : undefined,
          primaryImageOfPage: pageImage ? imageObject(pageImage) : undefined,
        })
      : null,
    article
      ? compact({
          '@type': schemaType(article),
          '@id': id(article.path, 'article'),
          headline: article.title,
          description: facts.description,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt,
          author: article.seo.authorName
            ? compact({
                '@type': 'Person',
                name: article.seo.authorName,
                url: article.seo.authorUrl,
              })
            : authorEntity,
          publisher,
          image: pageImage ? [imageObject(pageImage)] : undefined,
          mainEntityOfPage: ref(pageId),
          articleSection: article.categories[0]?.name,
          keywords: article.tags.map((tag) => tag.name),
          inLanguage: locale,
        })
      : null,
    breadcrumb,
  ].filter((node) => node !== null);

  return { title: facts.title, meta, links, graph };
};
