import { termTarget } from '#lib/theme/pagination.js';
// The single metadata set of every public page: title, meta, links and JSON-LD, built from
// explicitly projected page data only. Pure, so SSR and client navigation render the same tags.
// Absolute URLs come only from the configured site origin, never from the request host.
import type { TaxonomyType } from '@cms/sdk';
// Not the `@cms/sdk` root: its schema modules would ship Zod to every public page.
import { formatSeoTitle } from '@cms/sdk/format';
import type {
  ContentView,
  PostList,
  SeoSettingsView,
  SiteView,
  TermArchiveView,
} from '#lib/server/public-view.js';
import { messagesFor } from '#lib/i18n/index.js';
import type { Messages } from '#lib/i18n/index.js';
import { en } from '#lib/i18n/en.js';
import { jsonLdScript } from '#lib/seo/json-ld.js';
import {
  FEED_PATH,
  LLMS_TXT_PATH,
  SITEMAP_PATH,
  crumbPath,
  feedPath,
  listingPath,
  markdownPath,
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
  /** Turning off comment notifications from an emailed link: never indexed. */
  | { kind: 'unsubscribe' }
  /** Unpublished changes: described like content, never indexed or canonical. */
  | { kind: 'preview'; content: ContentView };

/** A public author archive. */
export interface AuthorView {
  name: string;
  slug: string;
  bio: string;
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
export const isArticle = (entry: Entry) => schemaType(entry) !== 'WebPage';

export const termLabel = (taxonomy: TaxonomyType, m: Messages = en) =>
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
export const crumbs = (page: SitePage | null, m: Messages = en): Crumb[] => {
  const home: Crumb = { name: m.themeHome, target: { kind: 'home' } };
  if (page?.kind === 'term')
    return [
      home,
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
  const category = isArticle(content) ? content.categories[0] : undefined;
  return [
    home,
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
  type: 'WebPage' | 'CollectionPage' | 'SearchResultsPage' | 'ProfilePage';
  /** Sharing image chosen for this page. */
  image: Image | null;
  /** Image shown on the page itself (the only one JSON-LD may claim). */
  pageImage: Image | null;
  prev?: string;
  next?: string;
}

const pagedIn = (m: Messages) => (title: string, page: number) =>
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

const describe = (
  site: SiteView,
  settings: SeoSettingsView,
  page: SitePage | null,
  absolute: (path: string) => string,
): Facts => {
  const m = messagesFor(site.locale);
  const paged = pagedIn(m);
  const format = (title: string) =>
    formatSeoTitle(title, site.title, settings.titleTemplate);
  const listing = { image: null, pageImage: null, follow: true } as const;

  switch (page?.kind) {
    case 'home': {
      const list = pagination(
        { kind: 'home', type: page.type, path: page.path },
        page.posts,
      );
      const front = page.type === 'post' && page.posts.page === 1 && !page.path;
      const social = front
        ? settings.homeTitle || site.title
        : paged(
            page.title ??
              (page.type === 'article' ? m.themeArticles : m.themePosts),
            page.posts.page,
          );
      const description = settings.homeDescription || site.description;
      return {
        ...listing,
        ...list,
        title: front ? social : format(social),
        name:
          page.title ??
          (page.type === 'article' ? m.themeArticles : site.title),
        description,
        socialTitle: social,
        socialDescription: description,
        canonical: absolute(list.path),
        index: list.inRange,
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
      const description =
        term.seo.description || term.description || site.description;
      const indexed =
        term.taxonomy === 'category'
          ? settings.indexCategories
          : settings.indexTags;
      return {
        ...list,
        title: format(base),
        name: term.name,
        description,
        socialTitle: term.seo.socialTitle || base,
        socialDescription: term.seo.socialDescription || description,
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
      const list = pagination({ kind: 'author', slug: author.slug }, posts);
      const base = paged(author.name, posts.page);
      const description = author.bio || site.description;
      return {
        ...listing,
        ...list,
        title: format(base),
        name: author.name,
        description,
        socialTitle: base,
        socialDescription: description,
        canonical: absolute(list.path),
        index: posts.total > 0 && list.inRange,
        type: 'ProfilePage',
      };
    }
    case 'archive': {
      const { archive, posts } = page;
      const list = pagination({ kind: 'archive', slug: archive.key }, posts);
      const base = paged(archive.name, posts.page);
      const description = archive.description || site.description;
      return {
        ...listing,
        ...list,
        title: format(base),
        name: archive.name,
        description,
        socialTitle: base,
        socialDescription: description,
        canonical: absolute(list.path),
        index: posts.total > 0 && list.inRange,
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
      // Date archives repeat what other listings show, so they are never indexed.
      return {
        ...listing,
        ...list,
        title: format(base),
        name,
        description: site.description,
        socialTitle: base,
        socialDescription: site.description,
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
        ),
        canonical: '',
        index: false,
        follow: false,
      };
    case 'login':
    case 'unsubscribe': {
      const name =
        page.kind === 'login' ? m.signInTitle : m.commentUnsubscribeTitle;
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
      // Every part of a split entry is canonical to itself, like WordPress.
      const { current, total } = content.pages;
      const partPath = (part: number) =>
        part > 1 ? `${content.path}?page=${part}` : content.path;
      const base = paged(content.seo.title || content.title, current);
      const description =
        content.seo.description || content.excerpt || site.description;
      // An explicit SEO image wins; otherwise the featured image, when the site has an address.
      const featured =
        content.featuredImage && absolute(content.featuredImage.url)
          ? {
              url: absolute(content.featuredImage.url),
              alt: content.featuredImage.alt,
            }
          : null;
      const image = content.seo.imageUrl
        ? { url: content.seo.imageUrl, alt: content.seo.imageAlt }
        : featured;
      return {
        title: format(base),
        name: content.title,
        description,
        socialTitle: content.seo.socialTitle || base,
        socialDescription: content.seo.socialDescription || description,
        path: partPath(current),
        canonical:
          (current === 1 && content.seo.canonicalUrl) ||
          absolute(partPath(current)),
        prev: current > 1 ? partPath(current - 1) : undefined,
        next: current < total ? partPath(current + 1) : undefined,
        index: !content.seo.noIndex,
        follow: !content.seo.noFollow,
        type: 'WebPage',
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

/** `language_TERRITORY` as Open Graph expects; empty when the locale names no region. */
const ogLocale = (locale: string) => {
  const match = /^([a-z]{2,3})[-_]([a-z]{2})$/i.exec(locale);
  return match ? `${match[1].toLowerCase()}_${match[2].toUpperCase()}` : '';
};

const robots = (settings: SeoSettingsView, index: boolean, follow: boolean) =>
  [
    index ? 'index' : 'noindex',
    follow ? 'follow' : 'nofollow',
    ...(index
      ? [
          `max-snippet:${settings.maxSnippet}`,
          `max-image-preview:${settings.maxImagePreview}`,
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
  settings: SeoSettingsView;
  page: SitePage | null;
}

/**
 * The `seo.meta` discovery filter value: presentation data plugins may adjust before the
 * head escapes it. `og` holds the first value of each `og:*` property; a page without a
 * canonical URL submits `/` (`NO_CANONICAL`), which keeps it without one.
 */
export interface SeoMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  og: Record<string, string>;
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
  const og: Record<string, string> = {};
  for (const tag of meta) if (isOg(tag)) og[tag.property!] ??= tag.content;
  return {
    title,
    description: meta.find((tag) => tag.name === 'description')?.content ?? '',
    canonicalUrl:
      links.find((link) => link.rel === 'canonical')?.href ?? NO_CANONICAL,
    og,
    jsonLd: graph,
  };
};

/** The head with a filtered value applied; the head escapes it as usual. */
const applyMeta = (parts: HeadParts, filtered: SeoMeta): HeadParts => {
  const original = seoMetaOf(parts);
  const description: HeadMeta[] = filtered.description
    ? [{ name: 'description', content: filtered.description }]
    : [];
  const og = Object.entries(filtered.og)
    .filter(([key]) => key.startsWith('og:'))
    .map(([property, content]) => ({ property, content }));
  const rest = parts.meta.filter((tag) => tag.name !== 'description');
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
      ...parts.links.filter((link) => link.rel !== 'canonical'),
    ],
    graph: filtered.jsonLd,
  };
};

/** The `seo.meta` filter value of a page, for the server to submit. */
export const headMeta = (input: HeadInput) => seoMetaOf(headParts(input));

/**
 * The page's head. `filtered` is the page's `seo.meta` filter result (page data `seoMeta`,
 * set by the server only when a plugin changed something).
 */
export const buildHead = ({
  filtered,
  ...input
}: HeadInput & { filtered?: SeoMeta | null }): Head => {
  const parts = headParts(input);
  const { title, meta, links, graph } = filtered
    ? applyMeta(parts, filtered)
    : parts;
  return {
    title,
    meta,
    links,
    jsonLd: jsonLdScript({ '@context': 'https://schema.org', '@graph': graph }),
  };
};

const headParts = ({ site, settings, page }: HeadInput): HeadParts => {
  const absolute = (path: string) =>
    settings.siteUrl ? `${settings.siteUrl}${path}` : '';
  const href = (path: string) => absolute(path) || path;
  const facts = describe(site, settings, page, absolute);
  const content = page?.kind === 'content' ? page.content : null;
  const article = content && isArticle(content) ? content : null;
  const index = settings.indexingEnabled && facts.index;
  const follow = settings.indexingEnabled && facts.follow;
  const selfUrl = facts.path === null ? '' : absolute(facts.path);
  const image =
    facts.image ??
    (settings.defaultImageUrl
      ? { url: settings.defaultImageUrl, alt: settings.defaultImageAlt }
      : null);
  const imageAlt = image ? image.alt || facts.socialTitle : '';

  const meta: HeadMeta[] = [];
  const name = (key: string, value: string) => {
    if (value) meta.push({ name: key, content: value });
  };
  const property = (key: string, value: string) => {
    if (value) meta.push({ property: key, content: value });
  };
  name('description', facts.description);
  name('robots', robots(settings, index, follow));
  name('google-site-verification', settings.googleVerification);
  name('msvalidate.01', settings.bingVerification);
  property('og:type', article ? 'article' : 'website');
  property('og:site_name', site.title);
  property('og:locale', ogLocale(site.locale));
  property('og:title', facts.socialTitle);
  property('og:description', facts.socialDescription);
  property('og:url', facts.canonical);
  if (image) {
    property('og:image', image.url);
    property('og:image:alt', imageAlt);
  }
  if (article) {
    property('article:published_time', article.publishedAt);
    property('article:modified_time', article.updatedAt);
    property('article:author', article.seo.authorUrl);
    property('article:section', article.categories[0]?.name ?? '');
    for (const tag of article.tags) property('article:tag', tag.name);
  }
  name('twitter:card', image ? 'summary_large_image' : 'summary');
  name('twitter:site', settings.twitterHandle);
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
  if (discoverable) {
    links.push({
      rel: 'alternate',
      type: 'application/rss+xml',
      title: site.title,
      href: href(FEED_PATH),
    });
    const term = page?.kind === 'term' ? page.term : null;
    const followed: (FeedTarget & { name: string }) | null =
      page?.kind === 'author'
        ? { kind: 'author', slug: page.author.slug, name: page.author.name }
        : term && (term.taxonomy === 'category' || term.taxonomy === 'tag')
          ? { kind: term.taxonomy, slug: term.slug, name: term.name }
          : null;
    if (followed)
      links.push({
        rel: 'alternate',
        type: 'application/rss+xml',
        title: messagesFor(site.locale).themeFeedTitle(
          site.title,
          followed.name,
        ),
        href: href(feedPath({ kind: followed.kind, slug: followed.slug })),
      });
  }
  if (discoverable && settings.llmsTxtEnabled)
    links.push({
      rel: 'describedby',
      type: 'text/plain',
      href: href(LLMS_TXT_PATH),
    });
  if (
    content &&
    index &&
    (!content.seo.canonicalUrl || content.seo.canonicalUrl === selfUrl)
  )
    links.push({
      rel: 'alternate',
      type: 'text/markdown',
      title: content.title,
      href: href(markdownPath(content.slug)),
    });
  // oEmbed discovery, so other sites (WordPress among them) can embed this entry as a card.
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
  const trail = crumbs(page, messagesFor(site.locale));
  const breadcrumbId = id(facts.path ?? '/', 'breadcrumb');
  const breadcrumb =
    settings.siteUrl && trail.length > 1
      ? {
          '@type': 'BreadcrumbList',
          '@id': breadcrumbId,
          itemListElement: trail.map((crumb, position) => ({
            '@type': 'ListItem',
            position: position + 1,
            name: crumb.name,
            item: absolute(crumbPath(crumb.target)),
          })),
        }
      : null;

  const graph = [
    compact({
      '@type': 'WebSite',
      '@id': websiteId,
      url: absolute('/'),
      name: site.title,
      description: site.description,
      inLanguage: site.locale,
      publisher,
    }),
    identityName
      ? compact({
          '@type': settings.entityType,
          '@id': identityId,
          name: identityName,
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
          inLanguage: site.locale,
          breadcrumb: breadcrumb ? ref(breadcrumbId) : undefined,
          primaryImageOfPage: facts.pageImage
            ? { '@type': 'ImageObject', url: facts.pageImage.url }
            : undefined,
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
            : undefined,
          publisher,
          image: article.seo.imageUrl ? [article.seo.imageUrl] : undefined,
          mainEntityOfPage: ref(pageId),
          articleSection: article.categories[0]?.name,
          keywords: article.tags.map((tag) => tag.name),
          inLanguage: site.locale,
        })
      : null,
    breadcrumb,
  ].filter((node) => node !== null);

  return { title: facts.title, meta, links, graph };
};
